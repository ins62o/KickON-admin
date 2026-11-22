// Daily reconciliation of player appearances/goals against the K League official per-club records.
// The K League site serves these through the same request its record page makes; nothing here writes
// to the site. Matching is by club + Korean name, narrowed by shirt number; anything ambiguous is left alone.

// K League club codes (public/teams/official/sources.json records where these came from).
export const KLEAGUE_CLUB_CODES: Record<string, string> = {
  'ulsan': 'K01', 'suwon-bluewings': 'K02', 'pohang': 'K03', 'jeju': 'K04', 'jeonbuk': 'K05', 'busan-ipark': 'K06',
  'jeonnam': 'K07', 'seongnam': 'K08', 'seoul': 'K09', 'daejeon': 'K10', 'daegu': 'K17', 'incheon': 'K18',
  'gyeongnam': 'K20', 'gangwon': 'K21', 'gwangju': 'K22', 'bucheon': 'K26', 'anyang': 'K27', 'suwon-fc': 'K29',
  'seoul-eland': 'K31', 'ansan-greeners': 'K32', 'chungnam-asan': 'K34', 'gimcheon': 'K35', 'gimpo': 'K36',
  'chungbuk-cheongju': 'K37', 'cheonan-city': 'K38', 'hwaseong': 'K39', 'paju': 'K40', 'gimhae': 'K41', 'yongin': 'K42',
};
const LEAGUE_CODES: Record<string, string> = { kleague: '1', kleague2: '2' };
const OFFICIAL_SITE = 'https://www.kleague.com';
export const OFFICIAL_RECORD_URL = `${OFFICIAL_SITE}/record/selectPersonalRecordByClub.do`;
export const OFFICIAL_PAGE_URL = `${OFFICIAL_SITE}/record/player.do`;
export const OFFICIAL_LANGUAGE_URL = `${OFFICIAL_SITE}/changeLang.do`;
const HANGUL = /[\uAC00-\uD7A3]/;

export type SquadPlayer = { league_id: string; team_id: string; player_id: string; name_ko: string | null; shirt_number: number | null };
export type OfficialRecord = { name: string; backNo: number | null; gameQty: number; goalQty: number; officialId: string | null };
export type OfficialRow = { league_id: string; team_id: string; player_id: string; appearances: number; goals: number; official_player_id: string | null; official_name: string };
export type MatchResult = { rows: OfficialRow[]; unmatched: number; ambiguous: number };

const count = (value: unknown) => {
  const number = typeof value === 'string' && /^\d{1,3}$/.test(value.trim()) ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 && number <= 999 ? number : null;
};
const normalizeName = (value: string) => value.normalize('NFC').replace(/\s+/g, '');

// The site answers {resultCode:"200", data:{list:[...]}}; any other shape is treated as a failed read.
export function parseOfficialRecords(payload: unknown): OfficialRecord[] {
  const body = payload as { resultCode?: unknown; data?: { list?: unknown } } | null;
  if (!body || String(body.resultCode) !== '200' || !Array.isArray(body.data?.list)) throw Error('OFFICIAL_RECORD_SHAPE');
  return body.data!.list!.flatMap(item => {
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const games = count(row.gameQty), goals = count(row.goalQty);
    if (!name || games === null || goals === null) return [];
    return [{ name, backNo: count(row.backNo), gameQty: games, goalQty: goals, officialId: typeof row.playerId === 'string' && row.playerId ? row.playerId : null }];
  });
}

export function matchOfficialRecords(teamId: string, records: OfficialRecord[], squad: SquadPlayer[]): MatchResult {
  const players = squad.filter(player => player.team_id === teamId && player.name_ko);
  const rows: OfficialRow[] = [];
  let unmatched = 0, ambiguous = 0;
  const conflicted = new Set<string>();
  for (const record of records) {
    let candidates = players.filter(player => normalizeName(player.name_ko!) === normalizeName(record.name));
    if (candidates.length > 1 && record.backNo !== null) candidates = candidates.filter(player => player.shirt_number === record.backNo);
    if (candidates.length === 0) { unmatched++; continue; }
    if (candidates.length > 1) { ambiguous++; continue; }
    const player = candidates[0];
    // Two official rows resolving to one app player means the names are not distinguishing enough: drop both.
    if (rows.some(row => row.player_id === player.player_id) || conflicted.has(player.player_id)) { conflicted.add(player.player_id); ambiguous++; continue; }
    rows.push({ league_id: player.league_id, team_id: teamId, player_id: player.player_id, appearances: record.gameQty, goals: record.goalQty, official_player_id: record.officialId, official_name: record.name });
  }
  return { rows: rows.filter(row => !conflicted.has(row.player_id)), unmatched, ambiguous };
}

// The site keeps the language in its server session and defaults by region, so requests from abroad get the
// English record, where players without an English name come back with an empty name. Open a session and
// toggle it (the endpoint flips the language) until it reports Korean, then read with that session.
function cookiesFrom(response: Response, jar: Map<string, string>) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')!] : []);
  for (const value of values) {
    const [pair] = value.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}
const cookieHeader = (jar: Map<string, string>) => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

export async function openKoreanSession(fetcher: typeof fetch) {
  const jar = new Map<string, string>();
  const page = await fetcher(OFFICIAL_PAGE_URL, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  await page.body?.cancel();
  if (!page.ok) throw Error(`OFFICIAL_SESSION_${page.status}`);
  cookiesFrom(page, jar);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher(OFFICIAL_LANGUAGE_URL, { method: 'POST', headers: { Cookie: cookieHeader(jar) }, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw Error(`OFFICIAL_LANGUAGE_${response.status}`); }
    cookiesFrom(response, jar);
    const body = await response.json() as { data?: { lang?: unknown } } | null;
    if (body?.data?.lang === 'ko') return cookieHeader(jar);
  }
  throw Error('OFFICIAL_LANGUAGE_NOT_KOREAN');
}

type Config = { url: string; serviceKey: string; cronSecret: string };
export function createOfficialStatsReconciler(config: Config, fetcher: typeof fetch = fetch, now: () => number = Date.now) {
  const rpc = async (name: string, body: unknown) => {
    const response = await fetcher(new URL(`/rest/v1/rpc/${name}`, config.url), { method: 'POST', headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw Error(`RPC_${name}_${response.status}`); }
    const text = await response.text(); return text ? JSON.parse(text) : null;
  };
  return async (request: Request) => {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!config.cronSecret || request.headers.get('Authorization') !== `Bearer ${config.cronSecret}`) return new Response(null, { status: 401 });
    if (!config.url || !config.serviceKey) return new Response(null, { status: 503 });
    let apply = false;
    try { apply = (await request.json() as { apply?: unknown })?.apply === true; } catch { apply = false; }
    const season = new Date(now()).getUTCFullYear();
    try {
      const context = await rpc('admin_official_stats_context', { p_season: season }) as { players?: SquadPlayer[] } | null;
      const squad = Array.isArray(context?.players) ? context!.players : [];
      const teams = [...new Map(squad.map(player => [player.team_id, player.league_id])).entries()];
      const rows: OfficialRow[] = [];
      let unmatched = 0, ambiguous = 0, clubs = 0;
      try {
        const cookie = await openKoreanSession(fetcher);
        for (const [teamId, leagueId] of teams) {
          const teamCode = KLEAGUE_CLUB_CODES[teamId], leagueCode = LEAGUE_CODES[leagueId];
          if (!teamCode || !leagueCode) continue;
          const response = await fetcher(OFFICIAL_RECORD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', Cookie: cookie }, body: JSON.stringify({ year: String(season), leagueId: leagueCode, teamId: teamCode }), signal: AbortSignal.timeout(15000), redirect: 'error' });
          if (!response.ok) { await response.body?.cancel(); throw Error(`OFFICIAL_HTTP_${response.status}`); }
          const records = parseOfficialRecords(await response.json());
          // A club list without any Korean name means the session fell back to English: read nothing.
          if (records.length && !records.some(record => HANGUL.test(record.name))) throw Error('OFFICIAL_NOT_KOREAN');
          const matched = matchOfficialRecords(teamId, records, squad);
          rows.push(...matched.rows); unmatched += matched.unmatched; ambiguous += matched.ambiguous; clubs++;
        }
        if (!clubs) throw Error('OFFICIAL_NO_CLUBS');
      } catch (error) {
        // A partial read is never applied; the run is recorded as failed so the sync screen shows it.
        const code = error instanceof Error ? error.message.slice(0, 80) : 'OFFICIAL_READ_FAILED';
        await rpc('admin_apply_official_player_stats', { p_season: season, p_rows: [], p_apply: false, p_unmatched: 0, p_ambiguous: 0, p_error: code });
        return Response.json({ applied: false, error: code }, { status: 502 });
      }
      const summary = await rpc('admin_apply_official_player_stats', { p_season: season, p_rows: rows, p_apply: apply, p_unmatched: unmatched, p_ambiguous: ambiguous, p_error: null });
      return Response.json({ applied: apply, clubs, matched: rows.length, unmatched, ambiguous, summary });
    } catch {
      return Response.json({ applied: false }, { status: 503 });
    }
  };
}

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  recordFootballProviderUsage,
  type FootballRateLimit,
} from '../_shared/footballProviderUsage.ts';

const API_BASE_URL = 'https://api.sportmonks.com/v3/football';
const PROVIDER = 'sportmonks';
const PROVIDER_LEAGUES: Record<string, number> = { kleague: 1034, kleague2: 1362 };
const RETRY_COOLDOWN_MS = 60_000;
const REFRESH_COOLDOWN_MS = 24 * 60 * 60_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ApiEnvelope<T> = {
  data: T;
  message?: string;
  pagination?: {
    current_page?: number;
    last_page?: number;
    has_more?: boolean;
  };
  rate_limit?: FootballRateLimit;
};

type StatisticType = {
  name?: string | null;
  developer_name?: string | null;
  code?: string | null;
};

type StatisticDetail = {
  type_id: number;
  value: unknown;
  type?: StatisticType | null;
};

type SquadPlayer = {
  id: number;
  position_id?: number | null;
  detailed_position_id?: number | null;
  name?: string | null;
  display_name?: string | null;
  common_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  image_path?: string | null;
  height?: number | null;
  weight?: number | null;
  date_of_birth?: string | null;
  in_squad?: boolean | null;
};

type SquadMember = {
  player_id: number;
  team_id: number;
  jersey_number?: number | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  position?: { name?: string | null } | null;
  detailedPosition?: { name?: string | null } | null;
  detailed_position?: { name?: string | null } | null;
  player?: SquadPlayer | null;
  details?: StatisticDetail[];
};

type StoredLocalization = {
  provider_player_id: string;
  name_ko: string | null;
  is_verified: boolean;
};

const SCORER_TYPE_IDS = {
  goals: 52,
  assists: 79,
  appearances: 321,
} as const;

const INCHEON_PLAYER_NAMES: Record<string, string> = {
  '321257': '정원진',
  '37623452': '박호민',
  '37735557': '백민규',
  '37918802': '이상현',
  '12126934': '정태욱',
  '37499625': '강영훈',
  '787504': '이상기',
  '751156': '문지환',
  '37624628': '여승원',
  '12844068': '오후성',
  '1452543': '정치인',
  '322907': '김연수',
  '160077': '레안드로',
  '189184': '이케르',
  '320976': '이태희',
  '37677365': '박승호',
  '159119': '제르소',
  '37627499': '김성민',
  '37677358': '김건희',
  '37342726': '서재민',
  '320839': '이주용',
  '37918803': '박경섭',
  '37735554': '최승구',
  '316': '이청용',
  '15662': '모건',
  '307696': '이명주',
  '448352': '후안 이비자',
  '31626461': '이동률',
  '37739133': '김영환',
  '29311996': '김동헌',
  '34690': '무고사',
  '37581707': '김명순',
};

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function normalizeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['total', 'count', 'value', 'all']) {
      const parsed = toNumber(record[key], Number.NaN);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function getDetailValue(
  details: StatisticDetail[] | undefined,
  typeId: number,
  developerNames: string[],
) {
  const detail = (details ?? []).find(item => {
    if (item.type_id === typeId) return true;
    const identifiers = [
      item.type?.developer_name,
      item.type?.name,
      item.type?.code,
    ]
      .filter(Boolean)
      .map(value => normalizeName(String(value)));
    return developerNames.some(name =>
      identifiers.includes(normalizeName(name)),
    );
  });
  return detail ? Math.max(0, Math.trunc(toNumber(detail.value))) : 0;
}

function getPlayerName(member: SquadMember) {
  const player = member.player;
  const fullName = [player?.firstname, player?.lastname]
    .filter(Boolean)
    .join(' ');
  return (
    player?.display_name ??
    player?.common_name ??
    player?.name ??
    (fullName || `Player ${member.player_id}`)
  );
}

function getPositionName(positionId?: number | null) {
  if (positionId === 24) return 'Goalkeeper';
  if (positionId === 25) return 'Defender';
  if (positionId === 26) return 'Midfielder';
  if (positionId === 27) return 'Attacker';
  return null;
}

function getSeededKoreanName(teamId: string, playerId: string, name: string) {
  if (teamId !== 'incheon') return null;
  if (INCHEON_PLAYER_NAMES[playerId]) return INCHEON_PLAYER_NAMES[playerId];
  const normalized = normalizeName(name);
  return normalized === 'minhyuklee' || normalized === 'leeminhyuk'
    ? '이민혁'
    : null;
}

async function apiGetAll<T>(
  admin: SupabaseClient,
  token: string,
  path: string,
) {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const url = new URL(`${API_BASE_URL}/${path}`);
    url.searchParams.set('api_token', token);
    url.searchParams.set('include', 'player;position;details.type');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const payload = (await response.json()) as ApiEnvelope<T[]>;
    await recordFootballProviderUsage(admin, {
      source: 'team-squad',
      endpoint: path,
      statusCode: response.status,
      rateLimit: payload.rate_limit,
    });
    if (!response.ok || payload.message) {
      throw new Error(
        `Sportmonks ${path} failed (${response.status}): ${
          payload.message ?? 'unknown error'
        }`,
      );
    }
    rows.push(...payload.data);
    const hasMore =
      payload.pagination?.has_more === true ||
      (payload.pagination?.last_page ?? page) > page;
    if (!hasMore) return rows;
    page += 1;
  }
}

export async function handleTeamSquadRequest(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server configuration is missing' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await request.json().catch(() => ({}));
  const suppliedSecret = request.headers.get('x-sync-secret') ?? '';
  const expectedSecret = Deno.env.get('FOOTBALL_SYNC_SECRET');
  let schedulerAuthorized = Boolean(
    expectedSecret && suppliedSecret === expectedSecret,
  );
  if (!schedulerAuthorized && suppliedSecret) {
    const { data: verified, error: verifyError } = await admin.rpc(
      'verify_live_football_sync_secret',
      { candidate: suppliedSecret },
    );
    schedulerAuthorized = !verifyError && verified === true;
  }
  if (!schedulerAuthorized) {
    // App 1.0.0 invokes this endpoint before reading the stored squad. Keep
    // that released client compatible, but never let a client trigger a
    // provider request or mutate the database.
    const accessToken = (request.headers.get('Authorization') ?? '').replace(
      /^Bearer\s+/i,
      '',
    );
    if (!accessToken) return json({ error: 'Unauthorized' }, 401);
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(accessToken);
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    return json({
      status: 'server-managed',
      teamId: String(body.teamId ?? '').trim() || null,
    });
  }

  const providerToken =
    Deno.env.get('SPORTMONKS_API_TOKEN') ?? Deno.env.get('FOOTBALL');
  if (!providerToken) {
    return json({ error: 'Server configuration is missing' }, 500);
  }

  const force = schedulerAuthorized && body.force === true;
  const teamId = String(body.teamId ?? '').trim();
  if (!teamId) return json({ error: 'teamId is required' }, 400);
  const season = body.season;
  const leagueId = body.leagueId;
  if (!Number.isInteger(season) || season < 2000 || season > 2200 ||
      typeof leagueId !== 'string' || !Object.hasOwn(PROVIDER_LEAGUES, leagueId)) {
    return json({ error: 'A supported season and leagueId are required' }, 400);
  }

  // Resolve the provider season from the same league catalog used by the cron.
  // Never default a K2 request (or a future season) to the K1 provider season.
  const [standingResult, seasonResult] = await Promise.all([
    admin.from('league_standings').select('team_id')
      .eq('season', season).eq('league_id', leagueId).eq('team_id', teamId).maybeSingle(),
    admin.from('football_provider_seasons').select('provider_season_id')
      .eq('provider', PROVIDER).eq('provider_league_id', PROVIDER_LEAGUES[leagueId])
      .eq('season_name', String(season)).maybeSingle(),
  ]);
  if (standingResult.error || seasonResult.error) {
    return json({ error: 'Unable to resolve the team season mapping' }, 500);
  }
  if (!standingResult.data) return json({ error: 'Team does not belong to this league and season' }, 400);
  const providerSeasonId = Number(seasonResult.data?.provider_season_id);
  if (!Number.isSafeInteger(providerSeasonId) || providerSeasonId <= 0) {
    return json({ error: 'Provider season mapping was not found' }, 400);
  }
  if ((body.providerLeagueId != null && Number(body.providerLeagueId) !== PROVIDER_LEAGUES[leagueId]) ||
      [body.providerSeasonId, body.seasonId].some(id => id != null && Number(id) !== providerSeasonId)) {
    return json({ error: 'Provider season or league mapping mismatch' }, 400);
  }

  const { data: team, error: teamError } = await admin
    .from('teams')
    .select('id, sportmonks_id')
    .eq('id', teamId)
    .maybeSingle();
  if (teamError) return json({ error: teamError.message }, 500);
  if (!team?.sportmonks_id) {
    return json({ error: 'Provider team mapping was not found' }, 404);
  }

  const legacySyncKey = `team-squad-${season}-${teamId}`;
  const syncKey = `${legacySyncKey}:${season}:${leagueId}`;
  const [stateResult, countResult] = await Promise.all(
    [
      admin
        .from('football_sync_state')
        .select('last_attempted_at, last_succeeded_at')
        .eq('sync_key', syncKey)
        .maybeSingle(),
      admin
        .from('team_players')
        .select('player_id', { count: 'exact', head: true })
        .eq('season', season)
        .eq('league_id', leagueId)
        .eq('team_id', teamId)
        .eq('in_squad', true),
    ],
  );
  if (stateResult.error || countResult.error) return json({ error: 'Unable to read squad sync state' }, 500);
  const syncState = stateResult.data;
  const storedPlayerCount = countResult.count;
  const now = Date.now();
  const lastSucceededAt = syncState?.last_succeeded_at
    ? new Date(syncState.last_succeeded_at).getTime()
    : 0;
  if (
    !force &&
    (storedPlayerCount ?? 0) > 0 &&
    lastSucceededAt &&
    now - lastSucceededAt < REFRESH_COOLDOWN_MS
  ) {
    return json({ status: 'cached', teamId, players: storedPlayerCount });
  }
  const lastAttemptedAt = syncState?.last_attempted_at
    ? new Date(syncState.last_attempted_at).getTime()
    : 0;
  if (!force && lastAttemptedAt && now - lastAttemptedAt < RETRY_COOLDOWN_MS) {
    return json({
      status: 'pending',
      teamId,
      retryAfterSeconds: Math.ceil(
        (RETRY_COOLDOWN_MS - (now - lastAttemptedAt)) / 1_000,
      ),
    });
  }

  const attemptedAt = new Date(now).toISOString();
  const { error: attemptError } = await admin.from('football_sync_state').upsert(
    {
      sync_key: syncKey,
      season,
      league_id: leagueId,
      last_attempted_at: attemptedAt,
    },
    { onConflict: 'sync_key' },
  );
  if (attemptError) return json({ error: attemptError.message }, 500);

  try {
    const squad = await apiGetAll<SquadMember>(
      admin,
      providerToken,
      `squads/seasons/${providerSeasonId}/teams/${team.sportmonks_id}`,
    );
    if (!squad.length) throw new Error('Provider returned an empty squad');
    if (squad.some(member => Number(member.team_id) !== Number(team.sportmonks_id))) {
      throw new Error('Provider returned a squad for a different team');
    }

    const playerIds = [
      ...new Set(squad.map(member => String(member.player_id))),
    ];
    const { data: storedLocalizations, error: localizationError } = await admin
      .from('football_player_localizations')
      .select('provider_player_id, name_ko, is_verified')
      .eq('provider', PROVIDER)
      .in('provider_player_id', playerIds);
    if (localizationError) throw localizationError;
    const storedLocalizationById = new Map<string, StoredLocalization>(
      (storedLocalizations ?? []).map(localization => [
        String(localization.provider_player_id),
        localization as StoredLocalization,
      ]),
    );

    const localizationRows = new Map<string, Record<string, unknown>>();
    const squadRows = new Map<string, Record<string, unknown>>();
    const scorerRows = new Map<string, Record<string, unknown>>();
    for (const member of squad) {
      const playerId = String(member.player_id);
      const playerName = getPlayerName(member);
      const sourceDisplayName =
        member.player?.display_name ?? member.player?.common_name ?? playerName;
      const storedLocalization = storedLocalizationById.get(playerId);
      const koreanName =
        storedLocalization?.name_ko ??
        getSeededKoreanName(teamId, playerId, sourceDisplayName);
      const appearances = getDetailValue(
        member.details,
        SCORER_TYPE_IDS.appearances,
        ['APPEARANCES'],
      );
      const goals = getDetailValue(member.details, SCORER_TYPE_IDS.goals, [
        'GOALS',
      ]);
      const assists = getDetailValue(member.details, SCORER_TYPE_IDS.assists, [
        'ASSISTS',
      ]);
      localizationRows.set(playerId, {
        provider: PROVIDER,
        provider_player_id: playerId,
        name_en: sourceDisplayName,
        name_ko: koreanName,
        is_verified: storedLocalization?.is_verified ?? Boolean(koreanName),
        updated_at: new Date().toISOString(),
      });
      squadRows.set(playerId, {
        season,
        league_id: leagueId,
        team_id: teamId,
        player_id: playerId,
        player_name: playerName,
        display_name: sourceDisplayName,
        display_name_ko: koreanName,
        image_url: member.player?.image_path ?? null,
        shirt_number: member.jersey_number ?? null,
        position:
          member.position?.name ??
          getPositionName(member.position_id ?? member.player?.position_id),
        detailed_position:
          member.detailedPosition?.name ??
          member.detailed_position?.name ??
          null,
        appearances,
        goals,
        assists,
        height: member.player?.height ?? null,
        weight: member.player?.weight ?? null,
        date_of_birth: member.player?.date_of_birth ?? null,
        // Presence in the season squad endpoint is additive evidence. A
        // provider-side omission or flag must never shrink the stable roster.
        in_squad: true,
        updated_at: new Date().toISOString(),
      });
      scorerRows.set(playerId, {
        season,
        league_id: leagueId,
        team_id: teamId,
        player_id: playerId,
        player_name: playerName,
        goals,
        appearances,
        updated_at: new Date().toISOString(),
      });
    }

    const { error: localizationUpsertError } = await admin
      .from('football_player_localizations')
      .upsert([...localizationRows.values()], {
        onConflict: 'provider,provider_player_id',
      });
    if (localizationUpsertError) throw localizationUpsertError;

    const { error: squadUpsertError } = await admin
      .from('team_players')
      .upsert([...squadRows.values()], {
        onConflict: 'season,league_id,player_id',
      });
    if (squadUpsertError) throw squadUpsertError;

    const { error: scorerUpsertError } = await admin
      .from('player_scoring_stats')
      .upsert([...scorerRows.values()], {
        onConflict: 'season,league_id,player_id',
      });
    if (scorerUpsertError) throw scorerUpsertError;

    const completedAt = new Date().toISOString();
    const { error: completionError } = await admin.from('football_sync_state').upsert(
      {
        sync_key: syncKey,
        season,
        league_id: leagueId,
        last_attempted_at: attemptedAt,
        last_succeeded_at: completedAt,
        last_error: null,
      },
      { onConflict: 'sync_key' },
    );
    if (completionError) throw completionError;

    // Only a real, fully persisted recovery can retire this team's old error.
    // Do not clear another team's failure or a newer legacy attempt.
    const { error: recoveryError } = await admin.from('football_sync_state')
      .update({ last_error: null })
      .eq('sync_key', legacySyncKey).is('season', null).is('league_id', null)
      .lte('last_attempted_at', attemptedAt);
    if (recoveryError) throw recoveryError;
    return json({
      status: 'synced',
      teamId,
      season,
      leagueId,
      providerSeasonId,
      players: squadRows.size,
      localizedPlayers: [...localizationRows.values()].filter(
        row => row.name_ko,
      ).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from('football_sync_state').upsert(
      {
        sync_key: syncKey,
        season,
        league_id: leagueId,
        last_attempted_at: attemptedAt,
        last_error: message,
      },
      { onConflict: 'sync_key' },
    );
    return json({ error: message }, 502);
  }
}

Deno.serve(handleTeamSquadRequest);

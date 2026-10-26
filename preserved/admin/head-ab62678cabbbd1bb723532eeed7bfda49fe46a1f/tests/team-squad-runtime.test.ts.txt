import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

// Execute the deployed handler with the real Supabase client; only the network
// and Deno environment are replaced. This catches ignored request scopes.
const compiled = await build({
  entryPoints: ['supabase/functions/sync-team-squad/index.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'deno-npm', setup(builder) {
    builder.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({
      path: import.meta.resolve('@supabase/supabase-js'), external: true,
    }));
  } }],
});
let handle: (request: Request) => Promise<Response>;
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
Object.defineProperty(globalThis, 'Deno', { configurable: true, value: {
  serve: (handler: typeof handle) => { handle = handler; },
  env: { get: (key: string) => ({
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    FOOTBALL_SYNC_SECRET: 'scheduler-secret', SPORTMONKS_API_TOKEN: 'provider-token',
  } as Record<string, string>)[key] },
} });
await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test.after(() => {
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});

type Options = { league?: string; badMembership?: boolean; providerFailure?: boolean; storageFailure?: boolean; wrongProviderTeam?: boolean };
async function exercise(body: Record<string, unknown>, options: Options = {}, secret = 'scheduler-secret') {
  const requests: Array<{ url: URL; method: string; body: Record<string, unknown> | Array<Record<string, unknown>> }> = [];
  const previousFetch = globalThis.fetch;
  const league = options.league ?? 'kleague2';
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const payload = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    requests.push({ url, method, body: payload });
    let data: unknown = null;
    let status = 200;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (url.hostname === 'api.sportmonks.com') {
      assert.equal(url.pathname, `/v3/football/squads/seasons/${league === 'kleague2' ? 27443 : 26894}/teams/18344`);
      data = options.providerFailure ? { message: 'temporary provider error' } : { data: [{
        player_id: 123, team_id: options.wrongProviderTeam ? 999 : 18344,
        jersey_number: 7, player: { display_name: 'Player', in_squad: false },
      }] };
      if (options.providerFailure) status = 503;
    } else if (url.pathname.endsWith('/league_standings')) {
      assert.equal(url.searchParams.get('league_id'), `eq.${league}`);
      assert.equal(url.searchParams.get('season'), 'eq.2026');
      data = options.badMembership ? null : { team_id: 'paju' };
    } else if (url.pathname.endsWith('/football_provider_seasons')) {
      assert.equal(url.searchParams.get('provider_league_id'), `eq.${league === 'kleague2' ? 1362 : 1034}`);
      data = { provider_season_id: league === 'kleague2' ? 27443 : 26894 };
    } else if (url.pathname.endsWith('/teams')) data = { id: 'paju', sportmonks_id: 18344 };
    else if (url.pathname.endsWith('/team_players') && method === 'HEAD') headers['content-range'] = '*/30';
    else if (url.pathname.endsWith('/team_players') && options.storageFailure) {
      status = 500; data = { message: 'database write failed', code: 'XX000' };
    } else if (url.pathname.endsWith('/football_player_localizations') && method === 'GET') {
      data = [{ provider_player_id: '123', name_ko: '검증된 이름', is_verified: true }];
    } else if (url.pathname.endsWith('/verify_live_football_sync_secret')) data = false;
    else if (url.pathname === '/auth/v1/user') data = { id: 'ordinary-user' };
    else if (!['football_sync_state', 'team_players', 'player_scoring_stats', 'football_player_localizations', 'football_provider_usage'].some(table => url.pathname.endsWith(`/${table}`))) {
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }
    return new Response(method === 'HEAD' ? null : JSON.stringify(data), { status, headers });
  };
  try {
    const response = await handle(new Request('https://test.supabase.co/functions/v1/sync-team-squad', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-sync-secret': secret, authorization: 'Bearer user-token' },
      body: JSON.stringify(body),
    }));
    return { status: response.status, data: await response.json(), requests };
  } finally { globalThis.fetch = previousFetch; }
}
const scopedBody = { teamId: 'paju', season: 2026, leagueId: 'kleague2', force: true };

for (const league of ['kleague', 'kleague2']) test(`${league}: cron payload resolves its own provider season and persists only that scope`, async () => {
  const result = await exercise({ ...scopedBody, leagueId: league }, { league });
  assert.equal(result.status, 200);
  assert.equal(result.data.status, 'synced');
  assert.equal(result.data.providerSeasonId, league === 'kleague2' ? 27443 : 26894);
  for (const table of ['team_players', 'player_scoring_stats']) {
    const rows = result.requests.find(r => r.url.pathname.endsWith(`/${table}`) && r.method === 'POST')!.body as Array<Record<string, unknown>>;
    assert.equal(rows[0].season, 2026); assert.equal(rows[0].league_id, league);
  }
  const players = result.requests.find(r => r.url.pathname.endsWith('/team_players') && r.method === 'POST')!.body as Array<Record<string, unknown>>;
  assert.equal(players[0].in_squad, true); assert.equal(players[0].display_name_ko, '검증된 이름');
  const states = result.requests.filter(r => r.url.pathname.endsWith('/football_sync_state') && r.method === 'POST');
  assert.ok(states.every(r => (r.body as Record<string, unknown>).sync_key === `team-squad-2026-paju:2026:${league}`));
  const recovery = result.requests.find(r => r.method === 'PATCH' && r.url.pathname.endsWith('/football_sync_state'))!;
  assert.equal(recovery.url.searchParams.get('sync_key'), 'eq.team-squad-2026-paju');
  assert.equal(recovery.url.searchParams.get('season'), 'is.null');
  assert.match(recovery.url.searchParams.get('last_attempted_at')!, /^lte\./);
});

test('invalid or missing scope, mismatched team and provider season fail before provider access', async () => {
  for (const [body, options] of [
    [{ teamId: 'paju' }, {}], [{ ...scopedBody, leagueId: 'all' }, {}],
    [{ ...scopedBody, providerSeasonId: 26894 }, {}],
    [{ ...scopedBody, seasonId: 26894 }, {}],
    [{ ...scopedBody, providerLeagueId: 1034 }, {}],
    [scopedBody, { badMembership: true }],
  ] as Array<[Record<string, unknown>, Options]>) {
    const result = await exercise(body, options);
    assert.equal(result.status, 400);
    assert.ok(result.requests.every(r => r.url.hostname !== 'api.sportmonks.com' && r.method !== 'POST'));
  }
});

for (const options of [{ providerFailure: true }, { storageFailure: true }, { wrongProviderTeam: true }]) test(`failed sync preserves legacy error and records scoped failure: ${JSON.stringify(options)}`, async () => {
  const result = await exercise(scopedBody, options);
  assert.equal(result.status, 502);
  assert.ok(result.requests.every(r => r.method !== 'PATCH'));
  const states = result.requests.filter(r => r.url.pathname.endsWith('/football_sync_state') && r.method === 'POST');
  assert.ok((states.at(-1)!.body as Record<string, unknown>).last_error);
  assert.ok(states.every(r => !(r.body as Record<string, unknown>).last_succeeded_at));
});

test('ordinary app callers stay DB-first and cannot trigger provider writes', async () => {
  const result = await exercise(scopedBody, {}, '');
  assert.equal(result.status, 200); assert.equal(result.data.status, 'server-managed');
  assert.equal(result.requests.length, 1); assert.equal(result.requests[0].url.pathname, '/auth/v1/user');
});

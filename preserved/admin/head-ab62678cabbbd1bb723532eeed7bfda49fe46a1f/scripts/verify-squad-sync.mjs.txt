import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({ options: {
  environment: { type: 'string' }, since: { type: 'string' },
} });
assert.ok(['development', 'production'].includes(values.environment), '--environment development|production is required');
assert.ok(values.since && Number.isFinite(Date.parse(values.since)), '--since ISO timestamp is required');
const env = { ...parseEnv(readFileSync(`.env.${values.environment}.local`, 'utf8')), ...process.env };
const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_METRICS_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const season = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
const [teams, states, summary] = await Promise.all([
  client.from('league_standings').select('team_id,league_id').eq('season', season).in('league_id', ['kleague', 'kleague2']),
  client.from('football_sync_state').select('sync_key,season,league_id,last_attempted_at,last_succeeded_at,last_error'),
  client.rpc('admin_get_dashboard_summary'),
]);
for (const result of [teams, states, summary]) assert.equal(result.error, null, result.error?.message);
assert.ok(teams.data.length > 0, 'No squad targets found');
for (const team of teams.data) {
  const key = `team-squad-${season}-${team.team_id}:${season}:${team.league_id}`;
  const state = states.data.find(row => row.sync_key === key);
  assert.ok(state, `Missing scoped state: ${key}`);
  assert.equal(state.season, season); assert.equal(state.league_id, team.league_id);
  assert.equal(state.last_error, null, `${key}: ${state.last_error}`);
  assert.ok(Date.parse(state.last_attempted_at) >= Date.parse(values.since), `No new attempt: ${key}`);
  assert.ok(Date.parse(state.last_succeeded_at) >= Date.parse(state.last_attempted_at), `Incomplete sync: ${key}`);
}
const unresolved = states.data.filter(row => row.last_error?.trim() && (
  !row.last_succeeded_at || Date.parse(row.last_attempted_at) > Date.parse(row.last_succeeded_at)
));
assert.deepEqual(unresolved.map(row => ({ key: row.sync_key, error: row.last_error })), [], 'Unresolved sync failures remain');
assert.equal(summary.data.failedSyncCount, 0, 'Dashboard has unrecovered run failures');
console.log(JSON.stringify({ environment: values.environment, checkedAt: new Date().toISOString(),
  since: values.since, teams: teams.data.length,
  leagues: Object.fromEntries(['kleague', 'kleague2'].map(league => [league, teams.data.filter(team => team.league_id === league).length])),
  unresolvedFailures: unresolved.length, dashboardFailures: summary.data.failedSyncCount,
}, null, 2));

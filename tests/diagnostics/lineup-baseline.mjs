// Opt-in B diagnostic. Not part of npm test. No service fixes or report files.
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import {URL} from 'node:url';
import {readFileSync, openSync, closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {connect} from 'node:net';

const head = '266bee578e7bc0236f065c1307ea2cce64e7415f';
const digest = value => createHash('sha256').update(value).digest('hex');
const paths = {
  dedup: 'supabase/functions/_shared/lineupPlayers.ts',
  publish: 'supabase/functions/_shared/publishFixtureLineup.ts',
  identity: 'supabase/functions/_shared/providerPlayerId.ts',
  recovery: 'supabase/functions/_shared/lineupIdentityRecovery.ts',
};

// A refusal to run unconfined must happen before importing application modules.
let writeDenied = false;
try { closeSync(openSync('/dev/null', 'w')); }
catch (error) { writeDenied = ['EPERM', 'EACCES'].includes(error.code); }
const networkDenied = await new Promise(resolve => {
  const socket = connect({host: '127.0.0.1', port: 9});
  socket.once('connect', () => { socket.destroy(); resolve(false); });
  socket.once('error', error => resolve(['EPERM', 'EACCES'].includes(error.code)));
  socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
});
if (!writeDenied || !networkDenied) {
  console.log(JSON.stringify({status: 'BLOCKED', reason: 'ISOLATION_NOT_PROVEN'}));
  process.exit(2);
}

// The read-only controller supplies pinned HEAD blobs over stdin. No child
// process is launched inside the network/file-write-denied test process.
const originals = JSON.parse(readFileSync(0, 'utf8'));
assert.equal(originals.head, head);
const oldDedupSource = originals.dedup;
assert.equal(digest(oldDedupSource), '315f68e2670d0811f8d003d4f740625d1d392a6ddb82694c5089826ec46b3550');
assert.equal(digest(originals.publish), '1f7dd5e1714198a8619ca35221d5b0e8abbf0fb4ad6c39a4d265ea74d2d7eff0');
assert.equal(digest(readFileSync(new URL(`../../${paths.dedup}`, import.meta.url))), '315f68e2670d0811f8d003d4f740625d1d392a6ddb82694c5089826ec46b3550');
const compile = source => stripTypeScriptTypes(source).replace(/^export\s+/gm, '');
const legacyDedup = runInNewContext(`${compile(oldDedupSource)};deduplicateLineupPlayers`);
const oldPublishSource = compile(originals.publish).replace(/^import .*lineupPlayers\.ts['"];?\s*$/m, '');
const legacyPublish = runInNewContext(`${oldPublishSource};publishFixtureLineup`, {deduplicateLineupPlayers: legacyDedup});
const {deduplicateLineupPlayers: currentDedup} = await import(new URL(`../../${paths.dedup}`, import.meta.url));
const {publishFixtureLineup: currentPublish} = await import(new URL(`../../${paths.publish}`, import.meta.url));
const {parseProviderPlayerId, resolveLineupPlayerIdentity} = await import(new URL(`../../${paths.identity}`, import.meta.url));
const {recoverMissingLineupPlayerIds} = await import(new URL(`../../${paths.recovery}`, import.meta.url));
const results = [];
async function check(name, action) {
  try { await action(); results.push({name, status: 'PASS'}); }
  catch (error) { results.push({name, status: 'FAIL', code: error.code ?? error.name}); }
}

function players(home = 11, away = 11, fixture = 'fixture-b', writer = 'candidate') {
  return [['home', home, 100], ['away', away, 200]].flatMap(([team, count, offset]) =>
    Array.from({length: count}, (_, i) => ({fixture_id: fixture, team_id: team,
      player_id: String(offset + i + 1), player_name: writer, role: 'STARTER', sort_order: i})));
}
function lineups(fixture = 'fixture-b', writer = 'candidate') {
  return ['home', 'away'].map(team => ({fixture_id: fixture, team_id: team, formation: writer,
    coach_id: null, coach_name: null, fetched_at: '2026-10-26T00:00:00Z'}));
}
const row = players()[0];
const bench = {...row, role: 'SUBSTITUTE'};
await check('same-role duplicate keeps one row in both implementations', () => {
  assert.equal(legacyDedup([row, {...row}]).length, 1);
  assert.equal(currentDedup([row, {...row}]).length, 1);
});
await check('HEAD preserves both DB-primary-key roles', () => {
  assert.equal(legacyDedup([row, bench]).length, 2);
  assert.equal(legacyDedup([bench, row]).length, 2);
});
await check('current must preserve both roles when STARTER arrives first', () => {
  assert.equal(currentDedup([row, bench]).length, 2);
});
await check('current must preserve both roles when SUBSTITUTE arrives first', () => {
  assert.equal(currentDedup([bench, row]).length, 2);
});
await check('current must retain the starter after provider order reversal', () => {
  assert.equal(currentDedup([bench, row]).some(item => item.role === 'STARTER'), true);
});
await check('invalid provider IDs reject starters and skip substitutes', () => {
  for (const value of [null, undefined, 0, -1, '0', '01', '1.5', 'invalid', Infinity]) {
    assert.equal(parseProviderPlayerId(value), null);
    assert.equal(resolveLineupPlayerIdentity(value, true).status, 'reject');
    assert.equal(resolveLineupPlayerIdentity(value, false).status, 'skip');
  }
  assert.equal(parseProviderPlayerId(' 101 '), '101');
});
const missing = {player_id: null, team_id: 1, jersey_number: 9, player_name: 'Synthetic Player', type_id: 11};
const squad = {player_id: 999, team_id: 1, season_id: 2026, jersey_number: 9,
  player: {id: 999, name: 'Synthetic Player'}};
await check('unique synthetic squad match recovers a missing starter ID', async () => {
  const rows = await recoverMissingLineupPlayerIds(2026, [missing], async () => [squad]);
  assert.equal(rows[0].player_id, 999);
});
await check('unrecoverable or ambiguous starter remains rejected', async () => {
  for (const candidates of [[], [squad, {...squad, player_id: 998, player: {id: 998, name: 'Synthetic Player'}}]]) {
    const rows = await recoverMissingLineupPlayerIds(2026, [missing], async () => candidates);
    assert.equal(rows[0].player_id, null);
    assert.equal(resolveLineupPlayerIdentity(rows[0].player_id, true).status, 'reject');
  }
});
await check('recovery refuses another team or season', async () => {
  await assert.rejects(recoverMissingLineupPlayerIds(2026, [missing], async () => [{...squad, team_id: 2}]), /scope mismatch/);
  await assert.rejects(recoverMissingLineupPlayerIds(2026, [missing], async () => [{...squad, season_id: 2025}]), /scope mismatch/);
});
await check('real current publisher propagates an RPC refusal', async () => {
  await assert.rejects(currentPublish({rpc: async () => ({error: {message: 'INCOMPLETE_OR_MISMATCHED_LINEUP'}})},
    'fixture-b', lineups(), players()), /INCOMPLETE_OR_MISMATCHED_LINEUP/);
});

// Only transport is substituted: each actual publisher constructs its RPC input.
async function capture(publish, input) {
  let payload;
  await publish({rpc: async (name, args) => {
    assert.equal(name, 'publish_fixture_lineup'); payload = args; return {error: null};
  }}, 'fixture-b', lineups(), input);
  assert.ok(payload);
  return JSON.parse(JSON.stringify(payload));
}
const cases = [];
for (const [name, input, oldCode, newCode] of [
  ['same_role', [...players(), {...row}], 'OK', 'OK'],
  ['starter_first', [...players(), bench], 'OK', 'OK'],
  ['substitute_first', [bench, ...players()], 'OK', 'OK'],
  ['ten_starters', players(10), 'P0001', 'P0001'],
  ['eleven_starters', players(), 'OK', 'OK'],
  ['twelve_starters', players(12), 'P0001', 'P0001'],
]) {
  cases.push({name: `HEAD_${name}`, expected_code: oldCode, payload: await capture(legacyPublish, input)});
  cases.push({name: `CURRENT_${name}`, expected_code: newCode, payload: await capture(currentPublish, input)});
}
cases.push({name: 'late_duplicate_primary_key', expected_code: '23505',
  payload: {target_fixture_id: 'fixture-b', target_lineups: lineups(), target_players: [...players(), {...row}]}});
cases.push({name: 'late_invalid_role', expected_code: '23514',
  payload: {target_fixture_id: 'fixture-b', target_lineups: lineups(), target_players: [...players(), {...row, role: 'INVALID'}]}});
cases.push({name: 'late_null_player_id', expected_code: '23502',
  payload: {target_fixture_id: 'fixture-b', target_lineups: lineups(), target_players: [...players(), {...bench, player_id: null}]}});

const report = {approval: 'ADMIN-STABILIZATION-20261026-01:B', head,
  isolation: {network_denied: networkDenied, file_write_denied: writeDenied},
  source_sha256: Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, digest(readFileSync(new URL(`../../${path}`, import.meta.url)))])),
  results, passed: results.filter(row => row.status === 'PASS').length,
  failed: results.filter(row => row.status === 'FAIL').length,
  observations: {HEAD_roles: legacyDedup([bench, row]).map(item => item.role),
    current_starter_first: currentDedup([row, bench]).map(item => item.role),
    current_substitute_first: currentDedup([bench, row]).map(item => item.role)},
  limits: ['No production configuration, payload, credentials or notification triggers',
    'PostgreSQL results require the separately isolated SQL fixture; fake RPC is not a rollback test']};
if (process.argv.includes('--sql-cases')) report.sql_cases = cases;
console.log(JSON.stringify(report));
process.exitCode = report.failed ? 1 : 0;

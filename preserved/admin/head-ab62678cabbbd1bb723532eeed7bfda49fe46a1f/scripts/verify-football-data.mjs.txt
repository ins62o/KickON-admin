import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { CURRENT_SEASON, SUPPORTED_LEAGUES, playerKey } from '../src/lib/football/config.ts';
import { fetchAllRows } from '../src/lib/data/pagination.ts';

const env = Object.fromEntries(fs.readFileSync('.env.development.local', 'utf8').split('\n')
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
  }));
// Public key exercises the same RLS path as the development preview. Read-only.
const client = createClient(env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const report = { season: CURRENT_SEASON, checkedAt: new Date().toISOString(), leagues: [], total: 0 };
for (const league of SUPPORTED_LEAGUES) {
  const [count, players, teams] = await Promise.all([
    client.from('team_players').select('player_id', { count: 'exact', head: true }).eq('season', CURRENT_SEASON).eq('league_id', league.id).eq('in_squad', true),
    fetchAllRows((from, to) => client.from('team_players').select('season,league_id,team_id,player_id').eq('season', CURRENT_SEASON).eq('league_id', league.id).eq('in_squad', true).order('league_id').order('team_id').order('player_id').range(from, to)),
    client.from('league_standings').select('team_id,teams(name,short_name,code)').eq('season', CURRENT_SEASON).eq('league_id', league.id).order('team_id'),
  ]);
  assert.equal(count.error, null); assert.equal(players.error, null); assert.equal(teams.error, null);
  assert.equal(players.data.length, count.count);
  const keys = new Set(players.data.map(row => playerKey({ id: row.player_id, leagueId: row.league_id, season: row.season })));
  assert.equal(keys.size, count.count);
  for (const team of teams.data) assert.ok(team.teams?.name && team.teams?.short_name && team.teams?.code);
  const expected = league.id === 'kleague' ? 470 : 620;
  assert.equal(count.count, expected, `${league.label} count changed; inspect sync history before updating this baseline`);
  assert.equal(teams.data.length, league.id === 'kleague' ? 12 : 17);
  report.leagues.push({ id: league.id, players: count.count, teams: teams.data.length, uniquePlayers: keys.size });
  report.total += count.count;
}
const all = await fetchAllRows((from, to) => client.from('team_players').select('season,league_id,team_id,player_id')
  .eq('season', CURRENT_SEASON).in('league_id', SUPPORTED_LEAGUES.map(league => league.id)).eq('in_squad', true)
  .order('league_id').order('team_id').order('player_id').range(from, to));
assert.equal(all.error, null); assert.equal(all.data.length, 1090); assert.equal(report.total, 1090);
console.log(JSON.stringify(report, null, 2));

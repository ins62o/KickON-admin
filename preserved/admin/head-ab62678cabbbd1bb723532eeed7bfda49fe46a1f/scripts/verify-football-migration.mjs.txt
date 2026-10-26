// Usage: node scripts/verify-football-migration.mjs /path/to/@electric-sql/pglite/dist/index.js
// Runs only in an ephemeral PostgreSQL WASM database. Never connects to Supabase.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const root = 'supabase/migrations/';
function source(file) { return fs.readFileSync(root + file, 'utf8'); }
function table(file, name) {
  const text = source(file); const start = text.search(new RegExp(`create table(?: if not exists)? public\\.${name} \\(`));
  assert.ok(start >= 0, name); return text.slice(start, text.indexOf('\n);', start) + 3);
}
function fn(file, name) {
  const text = source(file); const start = text.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, name); return text.slice(start, text.indexOf('\n$$;', start) + 4);
}
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
create table public.admin_users(user_id uuid primary key);
insert into public.admin_users values(auth.uid());
create table public.sync_runs(id uuid primary key default gen_random_uuid());
create function public.is_admin(text) returns boolean language sql as $$ select true $$;
create function public.admin_has_capability(text) returns boolean language sql as $$ select true $$;
create table public.test_audit(action text, entity_type text, entity_id text, before_value jsonb, after_value jsonb, reason text);
create function public.data_center_write_audit(text,text,text,jsonb,jsonb,text) returns void language sql as $$ insert into public.test_audit values($1,$2,$3,$4,$5,$6) $$;
`);
for (const [file, names] of [
  ['202608270001_initial_schema.sql', ['teams', 'stadiums', 'fixtures', 'league_standings', 'player_scoring_stats']],
  ['202608270013_team_players.sql', ['team_players']],
  ['202608280002_football_localizations_and_team_metrics.sql', ['football_player_localizations']],
  ['202609050001_admin_operations.sql', ['manual_overrides']],
  ['202609050002_player_operations.sql', ['player_squad_snapshots', 'player_squad_snapshot_rows', 'player_change_events']],
  ['202609050003_provider_snapshots.sql', ['provider_entity_snapshots']],
  ['202609050008_admin_data_center.sql', ['football_player_localization_reviews', 'manual_player_records']],
  ['202608280004_football_sync_state.sql', ['football_sync_state']],
  ['202608290018_football_season_catalog.sql', ['football_provider_seasons']],
]) for (const name of names) await db.exec(table(file, name));
await db.exec(`
alter table public.teams add column sportmonks_id bigint;
alter table public.fixtures add column post_match_sync_due_at timestamptz, add column post_match_synced_at timestamptz;
alter table public.fixtures add column attendance_latitude double precision, add column attendance_longitude double precision, add column attendance_radius_meters integer not null default 300;
alter table public.team_players add column display_name_ko text, add column data_source text not null default 'SPORTSMONKS', add column manual_lock boolean not null default false;
alter table public.league_standings add column clean_sheets integer default 0, add column average_possession numeric;
alter table public.manual_overrides add column season integer default 2026, add column league_id text default 'kleague';
create unique index manual_overrides_active_field_idx on public.manual_overrides(entity_type,entity_id,season,league_id,field_path) where released_at is null;
create unique index provider_entity_snapshots_dedupe_idx on public.provider_entity_snapshots(provider,entity_type,entity_id,snapshot_hash);
`);
for (const [file, name] of [
  ['202609050008_admin_data_center.sql','admin_set_verified_player_name'],
  ['202609050003_provider_snapshots.sql','apply_fixture_manual_override'],
  ['202609080007_fix_fixture_schedule_changed_overrides.sql','admin_update_fixture_schedule'],
  ['202609070001_admin_delete_player.sql','admin_delete_player'],
  ['202608290018_football_season_catalog.sql','invoke_football_data_sync'],
]) await db.exec(fn(file, name));
await db.exec(source('202609120001_admin_multi_league.sql'));
console.log('PASS: complete migration compiles');
await db.exec(`
insert into teams(id,name,short_name,code) values('k1','K1','K1','K1'),('k2','K2','K2','K2');
insert into league_standings(season,league_id,team_id,rank) values(2026,'kleague','k1',1),(2026,'kleague2','k2',1);
insert into team_players(season,league_id,team_id,player_id,player_name) values(2026,'kleague','k1','duplicate','K1 original'),(2026,'kleague2','k2','duplicate','K2 original');
`);
await assert.rejects(db.query(`select admin_create_manual_player(p_team_id=>'k2',p_player_name=>'Test',p_reason=>'test reason')`), /SEASON_AND_LEAGUE_REQUIRED/);
await assert.rejects(db.query(`select admin_create_manual_player(p_team_id=>'k1',p_player_name=>'Test',p_reason=>'test reason',p_season=>2026,p_league_id=>'kleague2')`), /TEAM_LEAGUE_MISMATCH/);
await db.query(`select apply_player_manual_override('duplicate',2026,'kleague2','shirt_number','99'::jsonb,'test reason')`);
assert.deepEqual((await db.query(`select league_id,shirt_number from team_players order by league_id`)).rows, [{league_id:'kleague',shirt_number:null},{league_id:'kleague2',shirt_number:99}]);
await db.query(`select apply_standing_manual_override('k2',2026,'kleague2','points','25'::jsonb,'test reason')`);
assert.equal((await db.query(`select points from league_standings where league_id='kleague'`)).rows[0].points,0);
await db.query(`select capture_player_squad_snapshot('k2',2026,'kleague2','test snapshot',null)`);
await db.exec(`update team_players set shirt_number=12 where league_id='kleague2'`);
await db.query(`select capture_player_squad_snapshot('k2',2026,'kleague2','test snapshot',null)`);
assert.ok((await db.query(`select * from player_change_events where league_id='kleague2' and season=2026`)).rows.length > 0);
for (const league of ['kleague','kleague2']) await db.query(`select ingest_provider_entity_snapshot('sportmonks','player','duplicate','duplicate',2026,$1,'test','{}'::jsonb,'{"shirt_number":1}'::jsonb,$2,now(),null,null)`,[league,'a'.repeat(64)]);
assert.equal((await db.query(`select count(*)::int as n from provider_entity_snapshots`)).rows[0].n,2);
await assert.rejects(db.query(`select admin_update_player_details('duplicate',2026,'kleague2','{"team_id":"k1","appearances":0,"goals":0,"assists":0}'::jsonb,'test reason')`), /TEAM_LEAGUE_MISMATCH/);

const manual = await db.query(`select admin_create_manual_player(p_team_id=>'k2',p_player_name=>'Manual test',p_reason=>'test reason',p_season=>2026,p_league_id=>'kleague2') as id`);
const manualId = manual.rows[0].id;
await db.query(`select admin_merge_manual_player($1,'duplicate',2026,'kleague2','test merge')`,[manualId]);
assert.equal((await db.query(`select in_squad from team_players where player_id=$1 and league_id='kleague2'`,[manualId])).rows[0].in_squad,false);
await db.query(`select admin_set_verified_player_name('duplicate','검증 이름','test reason',2026,'kleague2')`);
assert.equal((await db.query(`select after_value->>'leagueId' as league from test_audit where action='PLAYER_VERIFIED_NAME_SCOPE'`)).rows[0].league,'kleague2');
await db.exec(`insert into stadiums(id,name,latitude,longitude) values('stadium','Stadium',37,127);
insert into fixtures(id,league_id,home_team_id,away_team_id,stadium_id,kickoff_at,status) values('fixture-k2','kleague2','k2','k1','stadium','2026-09-01T10:00:00Z','SCHEDULED');`);
await assert.rejects(db.query(`select apply_fixture_manual_override('fixture-k2','home_score','2'::jsonb,'test reason','kleague')`),/FIXTURE_LEAGUE_MISMATCH/);
await db.query(`select apply_fixture_manual_override('fixture-k2','home_score','2'::jsonb,'test reason','kleague2')`);
assert.equal((await db.query(`select home_score from fixtures where id='fixture-k2'`)).rows[0].home_score,2);
await db.query(`select admin_update_fixture_schedule('fixture-k2','2026-09-02T10:00:00Z','stadium',37.1,127.1,300,'test schedule','kleague2')`);
assert.equal((await db.query(`select attendance_latitude from fixtures where id='fixture-k2'`)).rows[0].attendance_latitude,37.1);
for(const [league,team] of [['kleague','k1'],['kleague2','k2']]) {
  await db.query(`select * from ingest_provider_player_change_candidates('sportmonks','test',null,$1::jsonb)`,[JSON.stringify([{dedupeKey:'b'.repeat(64),playerId:'duplicate',playerName:'Test',toTeamId:team,changeType:'squad_added',observedAt:new Date().toISOString(),beforeValue:{},afterValue:{},season:2026,leagueId:league}])]);
}
assert.equal((await db.query(`select count(*)::int as n from player_change_events where source='SportsMonks candidate'`)).rows[0].n,2);
await db.exec(`create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('kickon_live_football_sync_url','https://example.test/sync-live-football'),('kickon_football_sync_secret','local-test-only');
create schema net; create table net.test_requests(id bigint generated always as identity, body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ declare n bigint; begin insert into net.test_requests(body) values(body) returning id into n; return n; end $$;
update teams set sportmonks_id=1;
insert into football_provider_seasons(provider,provider_league_id,provider_season_id,season_name) values('sportmonks',1034,26894,'2026'),('sportmonks',1362,27443,'2026');`);
await db.query(`select invoke_scheduled_team_squad_sync()`);
await db.query(`select invoke_daily_team_metrics_sync()`);
assert.deepEqual((await db.query(`select body->>'leagueId' as league from net.test_requests order by id`)).rows.map(row=>row.league),['kleague','kleague2','kleague','kleague2']);
await db.exec(`truncate net.test_requests;`);
await db.query(`select invoke_live_football_sync()`);
assert.deepEqual((await db.query(`select body->>'leagueId' as league from net.test_requests order by body->>'leagueId'`)).rows.map(row=>row.league),['1034','1362']);
await db.exec(`truncate net.test_requests; update fixtures set status='FINISHED',post_match_sync_due_at=now()-interval '1 minute';`);
await db.query(`select invoke_due_post_match_football_sync()`);
assert.deepEqual((await db.query(`select body->>'leagueId' as league,body->>'seasonId' as season from net.test_requests`)).rows,[{league:'1362',season:'27443'}]);
await db.exec(`truncate net.test_requests; insert into football_sync_state(sync_key,season,league_id,last_succeeded_at) values('sportmonks-history-2024-2026-kleague',2026,'kleague',now());`);
await db.query(`select invoke_initial_football_history_backfill()`);
assert.deepEqual((await db.query(`select body->>'leagueId' as league from net.test_requests`)).rows,[{league:'1362'}]);
await db.exec(`truncate net.test_requests;`);
await assert.rejects(db.query(`select invoke_fixture_goal_backfill(5)`),/SEASON_AND_LEAGUE_REQUIRED/);
await db.query(`select invoke_fixture_goal_backfill(5,2026,'kleague2')`);
assert.deepEqual((await db.query(`select body->>'leagueId' as league,body->>'seasonId' as season from net.test_requests`)).rows,[{league:'1362',season:'27443'}]);
await assert.rejects(db.query(`insert into football_sync_state(sync_key,season,league_id,last_succeeded_at) values('sportmonks-history-2024-2026-kleague',2026,'kleague2',now()) on conflict(sync_key) do update set season=excluded.season,league_id=excluded.league_id`),/SYNC_SCOPE_COLLISION/);
console.log('PASS: live, post-match, history and goal-backfill dispatch retain actual league/season; K1 history success does not suppress K2');
console.log('PASS: same-league manual create/merge, verified-name audit, fixture score/schedule/location, provider candidate dedupe, and both daily cron payloads');
await db.query(`select admin_delete_player('duplicate',2026,'kleague2','test deletion')`);
assert.equal((await db.query(`select in_squad from team_players where league_id='kleague'`)).rows[0].in_squad,true);
assert.equal((await db.query(`select in_squad from team_players where league_id='kleague2'`)).rows[0].in_squad,false);
assert.equal((await db.query(`select after_value->>'leagueId' as league from test_audit where action='PLAYER_DELETED'`)).rows[0]?.league,'kleague2');
console.log('PASS: missing scope rejected; team/league mismatch rejected; K2 player & standing overrides, snapshot events, scoped snapshot dedupe, deletion/audit preserve K1');
await db.close();

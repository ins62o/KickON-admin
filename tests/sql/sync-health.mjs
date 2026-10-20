import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`
 create role anon;create role authenticated;create role service_role;create schema auth;
 create type public.admin_role as enum ('viewer','operator');
 create function auth.role() returns text language sql as $$ select coalesce(current_setting('qa.role',true),'authenticated') $$;
 create function public.is_admin(public.admin_role) returns boolean language sql as $$ select coalesce(current_setting('qa.admin',true),'false')='true' $$;
 create function public.get_admin_cron_jobs() returns table(job_id bigint,job_name text,schedule text,active boolean,last_status text,last_started_at timestamptz,last_finished_at timestamptz,last_message text,failure_count_24h bigint) language sql as $$ select 1::bigint,'kickon-live-football-sync','* * * * *',true,'succeeded',now(),now(),null::text,0::bigint $$;
 create table public.football_sync_state(sync_key text primary key,season integer,league_id text,last_attempted_at timestamptz,last_succeeded_at timestamptz,last_error text);
 create table public.live_sync_leases(sync_key text primary key,lease_owner uuid,lease_expires_at timestamptz);
 create table public.provider_fetch_controls(scope text primary key,paused boolean);
 create table public.fixtures(id text primary key,league_id text,sportmonks_id bigint,status text,kickoff_at timestamptz,provider_status text);
 create table public.football_provider_usage(id bigint primary key,source text,observed_at timestamptz,status_code integer,league_ids text[],endpoint text);
 insert into public.provider_fetch_controls values ('GLOBAL',false),('kleague',false),('kleague2',false);
 insert into public.football_sync_state values ('sportmonks-live',null,null,now(),now(),null);
`);
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200004_admin_sync_health.sql',import.meta.url),'utf8'));
await db.exec('set role anon');
await assert.rejects(db.query('select public.get_admin_football_sync_health()'),/permission denied/);
await db.exec('reset role;set role authenticated');
await assert.rejects(db.query('select public.get_admin_football_sync_health()'),/ADMIN_REQUIRED/);
await db.exec("select set_config('qa.admin','true',false)");
const read=async()=>(await db.query('select public.get_admin_football_sync_health() as health')).rows[0].health;
let value=await read();
assert.equal(value.jobs[0].job_name,'kickon-live-football-sync');assert.equal(value.live.has_error,false);assert.equal(value.live.running,false);
assert.equal(value.live.leagues.length,2);assert.equal(value.live.leagues[0].lineup_targets,0);assert.equal(value.live.leagues[0].lineup_poll_at,null);
await assert.rejects(db.query('select * from public.football_provider_usage'),/permission denied/);
await db.exec(`reset role;
 insert into public.fixtures values ('near','kleague',1,'SCHEDULED',now()+interval '1 hour',null),('far','kleague',2,'SCHEDULED',now()+interval '4 hours',null),('playing','kleague2',3,'LIVE',now()-interval '3 hours',null);
 insert into public.football_provider_usage values
 (1,'live-lineups',now(),200,array['kleague'],'REDACTED_ENDPOINT'),
 (2,'live-poll',now(),500,array['kleague2'],'REDACTED_ENDPOINT'),
 (3,'live-lineups',now()+interval '1 hour',200,array['kleague2'],'REDACTED_ENDPOINT'),
 (4,'live-poll',now(),200,null,'REDACTED_ENDPOINT');
 insert into public.live_sync_leases values ('sportmonks-live','00000000-0000-0000-0000-000000000001',now()+interval '1 minute');
 update public.provider_fetch_controls set paused=true where scope='kleague2';
 set role authenticated;
`);
value=await read();const [k1,k2]=value.live.leagues;
assert.equal(k1.lineup_targets,1);assert.equal(k1.live_targets,0);assert.equal(k1.lineup_http_status,200);assert.equal(k1.live_http_status,null);
assert.equal(k2.live_targets,1);assert.equal(k2.live_http_status,500);assert.equal(k2.lineup_poll_at,null);assert.equal(k2.paused,true);assert.equal(value.live.running,true);
assert.ok(!JSON.stringify(value).includes('REDACTED_ENDPOINT'));
await db.exec("reset role;delete from public.provider_fetch_controls where scope='GLOBAL';set role authenticated");
assert.equal((await read()).live.leagues[0].paused,null);
await db.close();
console.log('PASS sync health SQL: viewer gate, secret-free projection, target windows, league isolation, pause/lease evidence and missing controls');

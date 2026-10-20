import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const sql=await fs.readFile(new URL('../../supabase/migrations/202610200021_push_recipient_diagnosis_snapshot.sql',import.meta.url),'utf8');
for(const env of ['development','production']){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;
 create type public.admin_role as enum('viewer');
 create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
 create function public.is_admin(public.admin_role) returns boolean language sql as $$select coalesce(current_setting('qa.admin',true)='yes',false)$$;
 create function extensions.digest(bytea,text) returns bytea language sql as $$select sha256($1)$$;
 create table public.push_outbox(id uuid primary key,user_id uuid,notification_id uuid,effect_key text,status text,created_at timestamptz default now(),completed_at timestamptz,last_error_code text,lease_owner uuid,lease_expires_at timestamptz,targets_materialized_at timestamptz,updated_at timestamptz,duplicate_suppressed_count integer not null default 0);
 create table public.push_tokens(user_id uuid,token text,platform text,apns_environment text,bundle_id text);
 create table public.push_runtime_config(singleton boolean primary key,max_targets_per_outbox integer);
 insert into public.push_runtime_config values(true,20);
 create table public.push_delivery_targets(outbox_id uuid,user_id uuid,token text,token_hash text,platform text,apns_environment text,bundle_id text,status text default 'PENDING',completed_at timestamptz,last_error_code text,unique(outbox_id,token_hash));
 create table public.push_delivery_attempts(id bigint,outbox_id uuid,status text,attempted_at timestamptz,completed_at timestamptz,error_code text,provider_message_id text);
 create table public.notifications(id uuid,user_id uuid,type text,data jsonb);
 create table public.notification_preferences(user_id uuid primary key,match_notifications_enabled boolean,goal_notifications_enabled boolean,lineup_notifications_enabled boolean,community_notifications_enabled boolean);
 grant select on public.push_outbox,public.push_delivery_targets to service_role;
 `);
 await db.exec(await fs.readFile(new URL(`./fixtures/push-materialize-${env}.sql`,import.meta.url),'utf8'));
 await db.exec('grant execute on function public.materialize_push_delivery_targets(uuid,uuid) to service_role');
 const user='00000000-0000-4000-8000-000000000001',notification='00000000-0000-4000-8000-000000000002',worker='00000000-0000-4000-8000-000000000003';
 const id=i=>`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`;
 const insert=async(i,status='PROCESSING')=>db.query(`insert into public.push_outbox(id,user_id,notification_id,effect_key,status,lease_owner,lease_expires_at) values($1,$2,$3,'fixture-finished:qa',$4,$5,now()+interval '1 hour')`,[id(i),user,notification,status,worker]);
 const read=async i=>(await db.query('select public.get_admin_push_delivery_detail($1) as value',[id(i)])).rows[0].value;
 const materialize=async(i,w=worker)=>db.query('select public.materialize_push_delivery_targets($1,$2) as count',[w,id(i)]);
 await db.query("insert into public.notifications values($1,$2,'MATCH','{\"phase\":\"FULL_TIME\"}')",[notification,user]);
 await db.query('insert into public.notification_preferences values($1,true,false,true,true)',[user]);
 // Existing rows remain unknown even when touched later; migrations never backfill history.
 await insert(0,'COMPLETED');await insert(1);await db.query('update public.push_outbox set targets_materialized_at=now() where id=$1',[id(1)]);
 await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200015_admin_push_delivery_diagnosis.sql',import.meta.url),'utf8'));
 await db.exec(sql);
 await db.exec("set request.jwt.claim.role='service_role';set role service_role");
 assert.equal((await read(0)).recipient_diagnosis,null);assert.equal((await read(1)).recipient_diagnosis,null);
 await db.exec('reset role');await insert(2);await db.exec('set role service_role');
 await materialize(2);let detail=await read(2),snapshot=detail.recipient_diagnosis;
 assert.equal(snapshot.outcome,'NO_REGISTERED_DEVICE');assert.equal(snapshot.registered_devices,0);assert.equal(snapshot.selected_devices,0);assert.equal(snapshot.match_enabled,true);assert.equal(snapshot.goal_enabled,false);assert.equal(snapshot.stage,'target_selection');assert.equal(detail.targets,0);
 await db.exec('reset role');await db.query('update public.notification_preferences set match_notifications_enabled=false where user_id=$1',[user]);await db.query("insert into public.push_tokens values($1,'DO_NOT_EXPOSE_TOKEN','ios','production','app.kickon')",[user]);
 await db.exec('set role service_role');assert.equal((await materialize(2)).rows[0].count,0);assert.deepEqual((await read(2)).recipient_diagnosis,snapshot);assert.equal((await read(2)).current_preference,false);
 await db.exec('reset role');await insert(3);await db.exec('set role service_role');await materialize(3);detail=await read(3);assert.equal(detail.recipient_diagnosis.outcome,'TARGETS_SELECTED');assert.equal(detail.recipient_diagnosis.registered_devices,1);assert.equal(detail.recipient_diagnosis.match_enabled,false);assert.equal(detail.targets,1);assert.ok(!JSON.stringify(detail).includes('DO_NOT_EXPOSE'));
 // Duplicate routes are counted from the same frozen set, without exposing credentials.
 await db.exec('reset role');await db.query("insert into public.push_tokens values($1,'DO_NOT_EXPOSE_TOKEN','ios','production','app.kickon')",[user]);await insert(8);await db.exec('set role service_role');await materialize(8);snapshot=(await read(8)).recipient_diagnosis;assert.equal(snapshot.registered_devices,2);assert.equal(snapshot.selected_devices,1);assert.equal(snapshot.duplicate_devices,1);
 // Neither a different worker nor an overflowing set can leave fabricated evidence.
 await db.exec('reset role');await insert(4);await db.exec('set role service_role');await assert.rejects(materialize(4,user),/PUSH_LEASE_OWNER_MISMATCH/);assert.equal((await read(4)).recipient_diagnosis,null);
 await db.exec('reset role');await db.query("insert into public.push_tokens select $1,'secret-'||g,'ios','production','app.kickon' from generate_series(1,21) g",[user]);await db.exec('set role service_role');await assert.rejects(materialize(4),/PUSH_TARGET_LIMIT_EXCEEDED/);assert.equal((await read(4)).recipient_diagnosis,null);
 await db.exec('reset role');await db.query('delete from public.push_tokens where user_id=$1',[user]);await db.query('delete from public.notification_preferences where user_id=$1',[user]);await insert(5);await db.exec('set role service_role');await materialize(5);snapshot=(await read(5)).recipient_diagnosis;assert.equal(snapshot.preference_exists,false);assert.equal(snapshot.match_enabled,null);
 // Successful materialized work retains its original observation through final state changes.
 await db.exec('reset role');snapshot=(await read(3)).recipient_diagnosis;await db.query("update public.push_outbox set status='COMPLETED' where id=$1",[id(3)]);assert.deepEqual((await read(3)).recipient_diagnosis,snapshot);
 // Early closure is observed without pretending a device selection happened.
 await db.exec('reset role');await insert(6,'PENDING');await db.query("update public.push_outbox set status='SUPPRESSED',last_error_code='PREFERENCE_DISABLED' where id=$1",[id(6)]);await db.exec('set role service_role');snapshot=(await read(6)).recipient_diagnosis;assert.equal(snapshot.stage,'closed_before_selection');assert.equal(snapshot.registered_devices,null);assert.equal(snapshot.selected_devices,null);assert.deepEqual((await read(6)).reasons,[{code:'PREFERENCE_DISABLED',count:null}]);
 await db.exec('reset role');await insert(7,'SUPPRESSED');assert.equal((await read(7)).recipient_diagnosis.stage,'closed_before_selection');
 await assert.rejects(db.query("update public.push_outbox set recipient_diagnosis='{}' where id=$1",[id(2)]),/IMMUTABLE/);
 await assert.rejects(db.query("update public.push_outbox set recipient_diagnosis='{}' where id=$1",[id(0)]),/SERVER_ONLY/);
 await db.query("update public.push_outbox set status='COMPLETED' where id=$1",[id(1)]);assert.equal((await read(1)).recipient_diagnosis,null);
 // Authenticated viewers can only read the guarded RPC; no raw tables or trigger access.
 await db.exec("set request.jwt.claim.role='authenticated';set role anon");await assert.rejects(read(2),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(read(2),/ADMIN_REQUIRED/);
 await db.exec("reset role;set qa.admin='yes';set role authenticated");assert.equal((await read(2)).recipient_diagnosis.match_enabled,true);await assert.rejects(db.query('select * from public.push_outbox'),/permission denied/);await assert.rejects(db.query('select public.capture_push_recipient_diagnosis()'),/permission denied/);
 await db.close();console.log(`PASS ${env}: original materialization, immutable observations, no history backfill, null/zero, rollback and ACL`);
}

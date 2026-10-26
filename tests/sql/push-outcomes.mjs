import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create type public.admin_role as enum('viewer');
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create function public.is_admin(public.admin_role) returns boolean language sql as $$select coalesce(current_setting('qa.admin',true)='yes',false)$$;
create table public.profiles(id uuid primary key,nickname text,team_id text,registration_completed_at timestamptz);
create table public.admin_users(user_id uuid primary key);
create table auth.identities(user_id uuid,provider text,created_at timestamptz default now());
create table public.notification_preferences(user_id uuid primary key,match_notifications_enabled boolean,goal_notifications_enabled boolean,lineup_notifications_enabled boolean,community_notifications_enabled boolean);
create table public.teams(id text,name text,code text);
create table public.notifications(id uuid,user_id uuid,type text,data jsonb,title text,body text);
create table public.push_outbox(id uuid primary key,user_id uuid,notification_id uuid,effect_key text,status text,created_at timestamptz,completed_at timestamptz,last_error_code text,dead_lettered_at timestamptz,targets_materialized_at timestamptz,expires_at timestamptz);
create table public.push_delivery_targets(outbox_id uuid,status text,completed_at timestamptz,last_error_code text);
create table public.push_delivery_attempts(id bigint,outbox_id uuid,attempted_at timestamptz,error_code text,status text,completed_at timestamptz);
`);
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200020_admin_push_metric_details.sql',import.meta.url),'utf8'));
const migration=new URL('../../supabase/migrations/202610240001_admin_push_delivery_outcomes.sql',import.meta.url);
try{await db.exec(await fs.readFile(migration,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
await db.exec("begin;set request.jwt.claim.role='service_role'");
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const bounds=(await db.query('select public.get_admin_push_overview() result')).rows[0].result;
assert.equal(bounds.today_expired,0,'expiry must be a real count, not an omitted field');
const start=Date.parse(bounds.day_start),end=Date.parse(bounds.day_end);
await db.query("insert into public.profiles values($1,'팬',null,now());",[id(1)]);
await db.query("insert into auth.identities values($1,'kakao',now())",[id(1)]);
await db.query('insert into public.notification_preferences values($1,true,true,true,true)',[id(1)]);
const cases=[
 {states:['SUCCEEDED','SUCCEEDED'],outcome:'success'},
 {states:['SUCCEEDED','INVALID_TOKEN'],outcome:'partial'},
 {states:['SUCCEEDED','SUPPRESSED'],code:'PUSH_EXPIRED',outcome:'partial'},
 {states:['SUCCEEDED','UNKNOWN_OUTCOME'],status:'UNKNOWN_OUTCOME',outcome:'unknown'},
 {states:['SUCCEEDED','RETRY'],status:'RETRY',outcome:'pending'},
 {states:['SUPPRESSED'],status:'SUPPRESSED',code:'PUSH_EXPIRED',outcome:'expired'},
 {states:['SUPPRESSED'],status:'SUPPRESSED',code:'PREFERENCE_DISABLED',outcome:'excluded'},
 {states:['SHADOWED'],status:'SHADOWED',outcome:'excluded'},
 {states:[],outcome:'no_target'},
 {states:[],materialized:false,outcome:'unknown'},
 {states:['INVALID_TOKEN'],outcome:'failure'},
 {states:['AUTH_CONFIGURATION'],status:'DEAD_LETTER',dead:true,outcome:'failure'},
 {states:[],status:'PENDING',materialized:false,outcome:'pending'},
 {states:['SUPPRESSED'],code:'PUSH_EXPIRED',status:'SUPPRESSED',at:start-1,outcome:null},
 {states:['SUPPRESSED'],code:'PUSH_EXPIRED',status:'SUPPRESSED',at:end,outcome:null},
 {states:['SUPPRESSED'],code:'PUSH_EXPIRED',status:'SUPPRESSED',at:start,outcome:'expired'},
];
for(const [i,c]of cases.entries()){
 const key=id(100+i),at=new Date(c.at??start+1000).toISOString();
 await db.query("insert into public.notifications values($1,$2,'MATCH','{}','알림','내용')",[key,id(1)]);
 await db.query("insert into public.push_outbox values($1,$2,$1,'event','COMPLETED',$3,$4,null,null,$5,null)",[key,id(1),new Date(start-86400000).toISOString(),at,c.materialized===false?null:at]);
 if(c.status)await db.query('update public.push_outbox set status=$2,completed_at=$3,dead_lettered_at=$4 where id=$1',[key,c.status,['PENDING','RETRY'].includes(c.status)||c.dead?null:at,c.dead?at:null]);
 for(const state of c.states)await db.query('insert into public.push_delivery_targets values($1,$2,$3,$4)',[key,state,at,state==='SUPPRESSED'?c.code??null:null]);
}
await db.query("insert into public.push_delivery_attempts values(1,$1,$2,null,'TRANSIENT_FAILURE',$2)",[id(104),new Date(start+2000).toISOString()]);
const overview=async()=>(await db.query('select public.get_admin_push_overview() result')).rows[0].result;
const metric=async(key,query='',page=1)=>(await db.query('select public.get_admin_push_metric_recipients($1,$2,$3) result',[key,query,page])).rows[0].result;
const data=await overview();
assert.equal(Date.parse((await metric('pending')).rows.find(r=>r.id===id(104)).metric_at),start+2000,'pending time must be the latest attempt, not creation or an older target result');
const fields={success:'today_succeeded',partial:'today_partial',failure:'today_failed',expired:'today_expired',unknown:'today_unknown',no_target:'today_no_target',excluded:'today_excluded',pending:'pending'};
let ids=[];
for(const [key,field]of Object.entries(fields)){
 const count=cases.filter(c=>c.outcome===key).length;
 assert.equal(data[field],count,field);
 const list=await metric(key);assert.equal(list.total,count);assert.equal(list.rows.length,count);
 assert.ok(list.rows.every(r=>r.delivery_outcome===key&&r.metric_at));
 ids.push(...list.rows.map(r=>r.id));
 assert.equal((await metric(key,'없는팬')).total,0);
 assert.equal((await metric(key,'',2)).rows.length,0);
}
assert.equal(ids.length,new Set(ids).size,'each notification belongs to only one outcome');
assert.equal(ids.length,cases.filter(c=>c.outcome).length);
assert.equal((await metric('expired')).rows[0].expired,1);
try{await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610240002_admin_push_failure_grouping.sql',import.meta.url),'utf8'));await db.exec("begin;set request.jwt.claim.role='service_role'");}catch(error){if(error.code!=='ENOENT')throw error;}
const grouped=await overview(),failedCases=cases.filter(c=>c.outcome&&!['success','pending'].includes(c.outcome));
assert.equal(grouped.today_failed,failedCases.length,'failure must include every non-success terminal outcome');
assert.equal((await metric('failure')).total,grouped.today_failed);
const failurePages=await Promise.all([1,2].map(page=>metric('failure','',page)));
const failureRows=failurePages.flatMap(p=>p.rows);
assert.equal(failureRows.length,failedCases.length);assert.equal(new Set(failureRows.map(r=>r.id)).size,failureRows.length);
assert.ok(failureRows.every(r=>!['success','pending'].includes(r.delivery_outcome)));
for(const reason of ['partial','failure','expired','unknown','no_target','excluded']){
 const list=await metric(reason==='failure'?'delivery_failure':reason);
 assert.equal(list.total,cases.filter(c=>c.outcome===reason).length);
 assert.ok(list.rows.every(r=>r.delivery_outcome===reason));
}
assert.equal(grouped.today_failed+grouped.today_succeeded+grouped.pending,cases.filter(c=>c.outcome).length);
try{await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610240003_admin_push_failure_reasons.sql',import.meta.url),'utf8'));await db.exec("begin;set request.jwt.claim.role='service_role'");}catch(error){if(error.code!=='ENOENT')throw error;}
const expiredRow=(await metric('expired')).rows.find(r=>r.id===id(105));
assert.deepEqual(expiredRow.failure_reasons,[{code:'PUSH_EXPIRED',count:1}]);
assert.ok(Object.hasOwn(expiredRow,'expires_at'));assert.ok(expiredRow.targets_materialized_at);
await db.query("update public.push_outbox set expires_at=$2 where id=$1",[id(105),new Date(start+500).toISOString()]);
assert.equal(Date.parse((await metric('expired')).rows.find(r=>r.id===id(105)).expires_at),start+500);
assert.deepEqual((await metric('no_target')).rows[0].failure_reasons,[]);
await db.query("update public.push_delivery_targets set last_error_code='UNREGISTERED' where outbox_id=$1 and status='INVALID_TOKEN'",[id(101)]);
const partial=(await metric('partial')).rows.find(r=>r.id===id(101));assert.deepEqual(partial.failure_reasons,[{code:'UNREGISTERED',count:1}]);
await db.exec('alter table public.push_outbox drop column expires_at');
assert.equal((await metric('expired')).rows[0].expires_at,null,'missing expiry column in older environments must remain unknown');
const denied=async(sql,pattern)=>{await db.exec('savepoint denial');await assert.rejects(db.query(sql),pattern);await db.exec('rollback to savepoint denial');};
await db.exec("set request.jwt.claim.role='authenticated';set role authenticated");
await denied('select public.get_admin_push_overview()',/ADMIN_REQUIRED/);
await denied("select public.get_admin_push_metric_recipients('expired','',1)",/ADMIN_REQUIRED/);
await db.exec("set qa.admin='yes'");
assert.equal((await overview()).today_expired,2);
await denied('select * from public.admin_push_delivery_outcomes()',/permission denied/);
await denied("select public.get_admin_push_metric_recipients('made-up','',1)",/INVALID_PUSH_METRIC_FILTER/);
await denied("select public.get_admin_push_metric_recipients('expired','',0)",/INVALID_PUSH_METRIC_FILTER/);
await db.exec('reset role;set role anon');
await denied('select public.get_admin_push_overview()',/permission denied/);
await denied("select public.get_admin_push_metric_recipients('unknown','',1)",/permission denied/);
await db.exec('reset role;rollback');
await db.close();
console.log('PASS: exclusive push outcomes, partial/unknown/pending priority, KST boundaries, matching lists, empty/search/pages and role guards');


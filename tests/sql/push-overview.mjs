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
 create table public.push_outbox(id uuid primary key,user_id uuid,notification_id uuid,effect_key text,status text,created_at timestamptz,completed_at timestamptz,last_error_code text);
 create table public.push_delivery_targets(outbox_id uuid,status text,token text,completed_at timestamptz);
 create table public.push_delivery_attempts(id bigint,outbox_id uuid,attempted_at timestamptz,error_code text,status text,completed_at timestamptz);
`);
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200017_admin_push_overview.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200018_admin_push_delivery_summary.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200019_admin_push_app_categories.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('../../supabase/migrations/202610200020_admin_push_metric_details.sql',import.meta.url),'utf8'));
await db.exec('begin');
const rejected=async(sql,pattern)=>{await db.exec('savepoint expected_denial');await assert.rejects(db.query(sql),pattern);await db.exec('rollback to savepoint expected_denial');};
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const prefs={1:[true,false,false,false],2:[false,false,false,false],3:[null,null,null,null],5:[true,true,true,true],6:[true,true,true,true],7:[true,true,true,true],8:[false,false,true,false],9:[false,null,false,false],10:[false,true,false,false]};
for(let n=1;n<=10;n++){
 await db.query('insert into public.profiles values($1,$2,null,$3)',[id(n),'DO_NOT_EXPOSE_USER',n===5?null:'2026-10-01']);
 await db.query('insert into auth.identities(user_id,provider) values($1,$2)',[id(n),n===7?'email':'kakao']);
 if(prefs[n])await db.query('insert into public.notification_preferences values($1,$2,$3,$4,$5)',[id(n),...prefs[n]]);
}
await db.query('insert into public.admin_users values($1)',[id(6)]);
await db.query("insert into auth.identities(user_id,provider) values($1,'email')",[id(8)]);
await db.exec('set role anon');await rejected('select public.get_admin_push_overview()',/permission denied/);
await db.exec('reset role;set role authenticated');await rejected('select public.get_admin_push_overview()',/ADMIN_REQUIRED/);
await db.exec("reset role;set qa.admin='yes';set role authenticated");
const read=async()=>(await db.query('select public.get_admin_push_overview() as result')).rows[0].result;
let data=await read();assert.deepEqual([data.total_users,data.enabled_users,data.disabled_users,data.unknown_users,data.today_succeeded,data.today_failed,data.pending],[7,3,1,3,0,0,0]);
assert.deepEqual([data.lineup_enabled_users,data.match_enabled_users,data.community_enabled_users,data.match_partial_users],[1,0,0,2]);
await db.exec('reset role');await db.query('update public.notification_preferences set match_notifications_enabled=true,goal_notifications_enabled=true,lineup_notifications_enabled=true,community_notifications_enabled=true where user_id=$1',[id(9)]);await db.exec('set role authenticated');
const overlap=await read();assert.deepEqual([overlap.enabled_users,overlap.lineup_enabled_users,overlap.match_enabled_users,overlap.community_enabled_users],[4,2,1,1]);
await db.exec('reset role');await db.query('update public.notification_preferences set match_notifications_enabled=false,goal_notifications_enabled=null,lineup_notifications_enabled=false,community_notifications_enabled=false where user_id=$1',[id(9)]);await db.exec('set role authenticated');
const start=Date.parse(data.day_start),end=Date.parse(data.day_end);
assert.equal(end-start,86400000);assert.equal(new Date(start+9*3600000).toISOString().slice(11),'00:00:00.000Z');
const cases=[
 {user:1,states:['PERMANENT_FAILURE','INVALID_TOKEN'],at:start,expected:true},
 {user:1,states:['PERMANENT_FAILURE'],at:start-1},
 {user:1,states:['PERMANENT_FAILURE'],at:end},
 {user:1,states:['SUCCEEDED'],success:true},
 {user:1,states:['SUPPRESSED'],status:'SUPPRESSED'},
 {user:1,states:[]},
 {user:1,states:['UNKNOWN_OUTCOME'],status:'UNKNOWN_OUTCOME'},
 {user:2,states:['PERMANENT_FAILURE']},
 {user:3,states:['PERMANENT_FAILURE']},
 {user:4,states:['PERMANENT_FAILURE']},
 {user:5,states:['PERMANENT_FAILURE']},
 {user:6,states:['PERMANENT_FAILURE']},
 {user:7,states:['PERMANENT_FAILURE']},
 {user:1,type:'MATCH',phase:'GOAL',states:['PERMANENT_FAILURE']},
 {user:8,type:'LINEUP',states:['PERMANENT_FAILURE'],expected:true},
 {user:8,type:null,effect:'fixture-lineup:deleted',states:['PERMANENT_FAILURE'],expected:true},
 {user:8,type:'SYSTEM',states:['PERMANENT_FAILURE'],expected:true},
 {user:2,type:'SYSTEM',states:['PERMANENT_FAILURE']},
 {user:1,states:['SUCCEEDED','PERMANENT_FAILURE'],success:true},
 {user:1,status:'DEAD_LETTER',states:['INVALID_TOKEN'],expected:true},
 {user:1,status:'DEAD_LETTER',states:['UNKNOWN_OUTCOME']},
 {user:1,status:'RETRY',states:['PERMANENT_FAILURE'],waiting:true},
 {user:10,type:'MATCH',phase:'GOAL_CANCELLED',states:['AUTH_CONFIGURATION'],expected:true},
 {user:1,states:['PERMANENT_FAILURE'],at:null},
 {user:1,states:['SUCCEEDED','SUCCEEDED'],success:true},
 {user:1,states:['SUCCEEDED'],at:null,success:true},
 {user:1,states:['SUCCEEDED'],receiptOffset:-1},
 {user:1,states:['SUCCEEDED'],receiptOffset:86400000},
 {user:1,states:['SUCCEEDED'],receiptOffset:0,success:true,targetOnly:true},
 {user:1,states:[],attemptSuccess:true,success:true},
 {user:2,states:['SUCCEEDED']},
 {user:8,type:'LINEUP',states:['SUCCEEDED'],success:true},
 {user:1,type:'MATCH',phase:'GOAL',states:['SUCCEEDED']},
 {user:1,status:'PENDING',states:[],at:null,waiting:true},
 {user:1,status:'PROCESSING',states:['PROCESSING'],at:null,waiting:true},
 {user:1,status:'RETRY',states:['RETRY'],at:null,waiting:true},
 {user:1,states:['PENDING'],waiting:true},
 {user:1,status:'RETRY',states:['SUCCEEDED','RETRY'],success:true},
 {user:1,status:'UNKNOWN_OUTCOME',states:['UNKNOWN_OUTCOME','RETRY']},
 {user:1,status:'DEAD_LETTER',states:['RETRY'],at:null},
 {user:1,status:'SUPPRESSED',states:['PENDING']},
 {user:1,status:'SHADOWED',states:['PENDING']},
 {user:2,status:'PENDING',states:[],at:null},
 {user:3,status:'PENDING',states:[],at:null},
 {user:8,type:'SYSTEM',status:'PENDING',states:[],at:null,waiting:true},
 {user:1,type:'MATCH',phase:'GOAL',status:'PENDING',states:[],at:null},
];
await db.exec('reset role');
for(const [index,row] of cases.entries()){
 const outbox=id(100+index),user=id(row.user),type=row.type===undefined?'MATCH':row.type;
 if(type)await db.query('insert into public.notifications(id,user_id,type,data) values($1,$2,$3,$4)',[outbox,user,type,JSON.stringify({phase:row.phase??'FULL_TIME'})]);
 await db.query('insert into public.push_outbox values($1,$2,$3,$4,$5,$6,$7,null)',[outbox,user,type?outbox:null,row.effect??'fixture-finished:example',row.status??'COMPLETED',new Date(start-86400000).toISOString(),row.at===null?null:new Date(row.at??start+60000).toISOString()]);
 const receipt=new Date(start+(row.receiptOffset??60000)).toISOString();
 for(const state of row.states)await db.query('insert into public.push_delivery_targets values($1,$2,$3,$4)',[outbox,state,'DO_NOT_EXPOSE_TOKEN',receipt]);
 for(let attempt=0;attempt<3;attempt++)await db.query('insert into public.push_delivery_attempts values($1,$2,$3,null,$4,$5)',[index*10+attempt,outbox,new Date(start+1000).toISOString(),row.attemptSuccess||row.states.includes('SUCCEEDED')&&!row.targetOnly?'SUCCEEDED':'TRANSIENT_FAILURE',receipt]);
}
await db.exec('set role authenticated');data=await read();assert.equal(data.today_failed,cases.filter(row=>row.expected).length);assert.equal(data.today_failed,6);assert.equal(data.today_succeeded,cases.filter(row=>row.success).length);assert.equal(data.pending,cases.filter(row=>row.waiting).length);assert.ok(!JSON.stringify(data).includes('DO_NOT_EXPOSE'));
const users=async(query='',page=1)=>(await db.query('select public.get_admin_push_enabled_users($1,$2) as result',[query,page])).rows[0].result;
const metric=async(value,query='',page=1)=>(await db.query('select public.get_admin_push_metric_recipients($1,$2,$3) as result',[value,query,page])).rows[0].result;
const enabled=await users();assert.equal(enabled.total,data.enabled_users);assert.deepEqual(enabled.rows.map(row=>row.user_id).sort(),[id(1),id(8),id(10)].sort());assert.equal(enabled.rows.find(row=>row.user_id===id(1)).goal_enabled,false);
for(const [value,key] of [['success','today_succeeded'],['failure','today_failed'],['pending','pending']]){
 const result=await metric(value);assert.equal(result.total,data[key]);assert.equal(new Set(result.rows.map(row=>row.id)).size,result.rows.length);assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPOSE_TOKEN'));assert.ok(result.rows.every(row=>row.metric_at));assert.equal((await metric(value,'not-found')).total,0);
}
await rejected("select public.get_admin_push_metric_recipients('unknown','',1)",/INVALID_PUSH_METRIC_FILTER/);
await rejected("select public.get_admin_push_metric_recipients('success','',0)",/INVALID_PUSH_METRIC_FILTER/);
await rejected("select public.get_admin_push_enabled_users(repeat('a',101),1)",/INVALID_PUSH_USER_FILTER/);
await rejected('select * from public.admin_push_members()',/permission denied/);await rejected('select * from public.admin_push_delivery_records()',/permission denied/);
await rejected('select * from public.push_delivery_targets',/permission denied/);
await db.exec('reset role');await db.query('update public.notification_preferences set match_notifications_enabled=false where user_id=$1',[id(1)]);await db.exec('set role authenticated');data=await read();assert.equal(data.enabled_users,2);assert.equal(data.disabled_users,2);assert.equal(data.today_failed,4);assert.equal(data.today_succeeded,cases.filter(row=>row.success&&row.user!==1).length);assert.equal(data.pending,cases.filter(row=>row.waiting&&row.user!==1).length);
await db.exec("reset role;set qa.admin='no';set request.jwt.claim.role='service_role';set role service_role");assert.equal((await read()).total_users,7);
await db.exec('reset role');
for(let n=1000;n<1023;n++){
 await db.query("insert into public.profiles values($1,$2,null,now())",[id(n),n===1000?'특수%팬':`추가 팬 ${n}`]);await db.query("insert into auth.identities(user_id,provider) values($1,'kakao')",[id(n)]);await db.query('insert into public.notification_preferences values($1,false,false,true,false)',[id(n)]);
}
for(let n=2000;n<2023;n++){
 await db.query("insert into public.notifications(id,user_id,type,data,title,body) values($1,$2,'LINEUP','{}','라인업 등록','선발 라인업 안내')",[id(n),id(8)]);
 await db.query("insert into public.push_outbox values($1,$2,$1,'fixture-lineup:example','COMPLETED',now(),null,null)",[id(n),id(8)]);
 await db.query("insert into public.push_delivery_targets values($1,'SUCCEEDED','DO_NOT_EXPOSE_TOKEN',$2),($1,'SUCCEEDED','DO_NOT_EXPOSE_TOKEN',$2)",[id(n),new Date(start+120000).toISOString()]);
}
await db.exec("set request.jwt.claim.role='authenticated';set qa.admin='yes';set role authenticated");
const userPages=await Promise.all([1,2,3].map(page=>users('',page)));assert.deepEqual(userPages.map(p=>p.rows.length),[10,10,5]);assert.ok(userPages.every(p=>p.total===25));assert.equal(new Set(userPages.flatMap(p=>p.rows.map(r=>r.user_id))).size,25);assert.equal((await users('%')).total,1);
const successPages=await Promise.all([1,2,3].map(page=>metric('success','',page)));assert.deepEqual(successPages.map(p=>p.rows.length),[10,10,4]);assert.ok(successPages.every(p=>p.total===24));assert.equal(new Set(successPages.flatMap(p=>p.rows.map(r=>r.id))).size,24);assert.equal((await read()).today_succeeded,24);
await db.exec("reset role;set qa.admin='no';set role authenticated");await rejected("select public.get_admin_push_enabled_users('',1)",/ADMIN_REQUIRED/);await rejected("select public.get_admin_push_metric_recipients('success','',1)",/ADMIN_REQUIRED/);
await db.exec('reset role;set role anon');await rejected("select public.get_admin_push_enabled_users('',1)",/permission denied/);await rejected("select public.get_admin_push_metric_recipients('success','',1)",/permission denied/);
await db.exec('rollback');await db.close();console.log('PASS push overview: real member scope, ON/OFF/unknown, KST day boundaries, unique accepted/failed notifications, real receipt timestamps, current pending queue, category ON, recovery/partial/unknown exclusions, permission checks and no secrets');

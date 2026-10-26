import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readPushEnabledUsers,readPushMetricRecipients} from '../src/management/push-settings.ts';
const at='2026-10-20T05:15:00Z';
const user={user_id:'user-1',nickname:'팬',team:null,match_enabled:true,goal_enabled:false,lineup_enabled:true,community_enabled:null,enabled:true};
const recipient={id:'outbox-1',user_id:'user-1',nickname:'팬',team:null,title:'내 글에 좋아요가 눌렸어요',body:'팬이 내 글을 좋아합니다',kind:'community',phase:null,created_at:at,status:'COMPLETED',last_attempted_at:at,last_error_code:null,attempts:1,targets:1,succeeded:1,failed:0,pending:0,unknown:0,shadowed:0,suppressed:0,metric_at:at,completed_at:at,delivery_outcome:'success',expired:0,failure_reasons:[],expires_at:null,targets_materialized_at:at};
function client(data:unknown,error:unknown=null,check?:(name:string,args:unknown)=>void){return {rpc(name:string,args:unknown){check?.(name,args);return {abortSignal(signal:AbortSignal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({data,error});}};}} as unknown as SupabaseClient;}
test('enabled users are paginated with literal search and preserve partial or unknown preferences',async()=>{
 const result=await readPushEnabledUsers(client({total:1,rows:[user]},null,(name,args)=>{assert.equal(name,'get_admin_push_enabled_users');assert.deepEqual(args,{p_query:'팬%',p_page:2});}),' 팬% ',2);
 assert.equal(result.rows[0].goal_enabled,false);assert.equal(result.rows[0].community_enabled,null);
 assert.deepEqual(await readPushEnabledUsers(client({total:0,rows:[]}),'',1),{total:0,rows:[]});
});
test('user list failures and incomplete preference data never become OFF, zero or empty success',async()=>{
 for(const data of [null,{}, {total:1,rows:[{...user,enabled:false}]},{total:1,rows:[{...user,lineup_enabled:undefined}]},{total:1,rows:[{...user,match_enabled:false,lineup_enabled:false,goal_enabled:false,community_enabled:false}]},{total:1,rows:[{...user,team:{id:1}}]},{total:0,rows:[user]},{total:1,rows:Array(11).fill(user)}])await assert.rejects(readPushEnabledUsers(client(data),'',1),/확인할 수 없어요/);
 await assert.rejects(readPushEnabledUsers(client({total:0,rows:[]},{message:'denied'}),'',1),/확인할 수 없어요/);
 await assert.rejects(readPushEnabledUsers(client(null),null as never,1),/확인할 수 없어요/);
 for(const [query,page] of [['',0],['x'.repeat(101),1]] as const)await assert.rejects(readPushEnabledUsers(client(null),query,page),/확인할 수 없어요/);
});
test('each delivery card requests its own aggregate scope, timestamp and real recipient evidence',async()=>{
 for(const metric of ['success','failure','pending'] as const){
  const result=await readPushMetricRecipients(client({total:1,rows:[{...recipient,delivery_outcome:metric}]},null,(name,args)=>{assert.equal(name,'get_admin_push_metric_recipients');assert.deepEqual(args,{p_metric:metric,p_query:'팬',p_page:3});}),metric,' 팬 ',3);
  assert.equal(result.rows[0].metric_at,at);assert.equal(result.rows[0].body,recipient.body);
 }
 for(const reason of ['partial','failure','expired','unknown','no_target','excluded'] as const){
  const fixture={...recipient,delivery_outcome:reason};
  assert.equal((await readPushMetricRecipients(client({total:1,rows:[fixture]}),'failure','',1)).rows[0].delivery_outcome,reason);
  await readPushMetricRecipients(client({total:1,rows:[fixture]},null,(_name,args)=>assert.deepEqual(args,{p_metric:reason==='failure'?'delivery_failure':reason,p_query:'팬',p_page:2})),'failure',' 팬 ',2,reason);
 }
 await assert.rejects(readPushMetricRecipients(client({total:1,rows:[recipient]}),'failure','',1),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null),'failure','',1,'bad' as never),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null),'success','',1,'expired'),/확인할 수 없어요/);
 assert.deepEqual(await readPushMetricRecipients(client({total:0,rows:[]}),'pending','',1),{total:0,rows:[]});
});
test('delivery card reads reject malformed evidence, unsupported filters and denied access',async()=>{
 for(const data of [null,{}, ...[{failure_reasons:undefined},{failure_reasons:[null]},{failure_reasons:[{code:'',count:1}]},{failure_reasons:[{code:'NEW',count:0}]},{failure_reasons:[{code:'NEW',count:2}]},{expires_at:undefined},{expires_at:'bad'},{targets_materialized_at:undefined},{delivery_outcome:undefined},{delivery_outcome:'expired'},{expired:undefined},{expired:-1},{expired:1}].map(patch=>({total:1,rows:[{...recipient,...patch}]})), {total:1,rows:[{...recipient,kind:'unknown'}]},{total:1,rows:[{...recipient,metric_at:undefined}]},{total:1,rows:[{...recipient,metric_at:'invalid'}]},{total:1,rows:[{...recipient,failed:2}]},{total:1,rows:[{...recipient,completed_at:undefined}]}])await assert.rejects(readPushMetricRecipients(client(data),'success','',1),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null,{message:'denied'}),'failure','',1),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null),'invalid' as never,'',1),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null),'success',null as never,1),/확인할 수 없어요/);
 await assert.rejects(readPushMetricRecipients(client(null),'success','',0),/확인할 수 없어요/);
});

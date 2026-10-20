import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readPushRecipients} from '../src/management/push-settings.ts';
import {pushRecipientStatus,type PushRecipient} from '../src/management/push-model.ts';
const row:PushRecipient={id:'outbox-1',user_id:'user-1',nickname:'현재 닉네임',team:{id:'seoul',name:'FC 서울',code:'SEL'},title:'경기 시작',body:'알림 내용',created_at:'2026-10-20T05:00:00Z',last_attempted_at:null,last_error_code:null,status:'COMPLETED',attempts:1,targets:1,succeeded:1,failed:0,pending:0,unknown:0,shadowed:0,suppressed:0};
test('delivery results use actual device evidence rather than outbox completion',()=>{
 for(const [patch,label] of [
  [{},'발송 성공'],[{targets:2,failed:1},'발송 성공'],[{succeeded:0,failed:1},'발송 실패'],
  [{succeeded:0,unknown:1},'결과 미확인'],[{succeeded:0,pending:1,status:'RETRY'},'재시도 대기'],
  [{succeeded:0,shadowed:1},'기록만'],[{succeeded:0,suppressed:1},'발송 제외'],
  [{succeeded:0,targets:0,attempts:0},'발송 대상 없음'],[{succeeded:0,targets:0,attempts:1},'결과 미확인'],[{succeeded:0,status:'DEAD_LETTER'},'발송 실패'],
  [{succeeded:0,pending:1,status:'DEAD_LETTER'},'발송 실패'],[{succeeded:0,pending:1,status:'SUPPRESSED'},'발송 제외'],[{succeeded:0,status:'DISMISSED'},'발송 제외'],
  [{succeeded:0,status:'FUTURE_STATUS'},'확인 필요'],
 ] as [Partial<PushRecipient>,string][])assert.equal(pushRecipientStatus({...row,...patch}).label,label);
});
test('recipient reads send scoped paginated filters and retain true empty or deleted notification records',async()=>{
 const client={rpc(name:string,args:unknown){assert.equal(name,'get_admin_push_recipients');assert.deepEqual(args,{p_kind:'goal',p_query:'팬',p_page:2,p_result:'success',p_phase:'all'});return {abortSignal:async()=>({data:{total:1,rows:[{...row,title:null,body:null}]},error:null})};}} as unknown as SupabaseClient;
 const result=await readPushRecipients(client,'goal',' 팬 ',2,'success');assert.equal(result.rows[0].title,null);assert.deepEqual(result.rows[0].team,row.team);
});
test('recipient failures and malformed counts remain errors instead of empty or successful data',async()=>{
 const client=(data:unknown,error:unknown=null)=>({rpc:()=>({abortSignal:async()=>({data,error})})} as unknown as SupabaseClient);
 assert.deepEqual(await readPushRecipients(client({total:0,rows:[]}),'match','',1),{total:0,rows:[]});
 for(const data of [null,{}, {total:1,rows:[{...row,succeeded:2}]},{total:1,rows:[{...row,last_attempted_at:'invalid'}]},{total:1,rows:[{...row,attempts:null}]},{total:1,rows:[{...row,team:undefined}]},{total:1,rows:[{...row,team:{id:123,name:'서울',code:'SEL'}}]},{total:0,rows:[row]}])await assert.rejects(readPushRecipients(client(data),'match','',1),/확인할 수 없어요/);
 await assert.rejects(readPushRecipients(client({total:0,rows:[]}),'goal','',1,'all','KICKOFF'),/확인할 수 없어요/);
 await assert.rejects(readPushRecipients(client(null,{message:'denied'}),'match','',1),/확인할 수 없어요/);
 await assert.rejects(readPushRecipients(client({total:0,rows:[]}),'match','',0),/확인할 수 없어요/);
 await assert.rejects(readPushRecipients(client({total:0,rows:[]}),'match','a'.repeat(101),1),/확인할 수 없어요/);
 await assert.rejects(readPushRecipients(client({total:0,rows:[]}),'match','',1,'invalid' as never),/확인할 수 없어요/);
});

test('match phase filters are sent with result and pagination and reject invalid phases',async()=>{
 const client={rpc(name:string,args:unknown){assert.equal(name,'get_admin_push_recipients');assert.deepEqual(args,{p_kind:'match_events',p_query:'팬',p_page:2,p_result:'failure',p_phase:'HALF_TIME'});return {abortSignal:async()=>({data:{total:0,rows:[]},error:null})};}} as unknown as SupabaseClient;
 await readPushRecipients(client,'match',' 팬 ',2,'failure','HALF_TIME');
 await assert.rejects(readPushRecipients(client,'match','',1,'all','invalid' as never),/확인할 수 없어요/);
});

test('excluded deliveries are a server result filter',async()=>{
 const client={rpc(name:string,args:unknown){assert.equal(name,'get_admin_push_recipients');assert.equal((args as {p_result:string}).p_result,'excluded');return {abortSignal:async()=>({data:{total:0,rows:[]},error:null})};}} as unknown as SupabaseClient;
 await readPushRecipients(client,'match','',1,'excluded','HALF_TIME');
});

test('match settings load status and goal phases together through the grouped read',async()=>{
 for(const phase of ['GOAL','GOAL_CANCELLED'] as const){
  const client={rpc(name:string,args:unknown){assert.equal(name,'get_admin_push_recipients');assert.equal((args as {p_kind:string}).p_kind,'match_events');assert.equal((args as {p_phase:string}).p_phase,phase);return {abortSignal:async()=>({data:{total:0,rows:[]},error:null})};}} as unknown as SupabaseClient;
  await readPushRecipients(client,'match','',1,'all',phase);
  await assert.rejects(readPushRecipients(client,'goal','',1,'all',phase),/확인할 수 없어요/);
 }
});

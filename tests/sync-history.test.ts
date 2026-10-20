import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readSyncHistory,syncHistoryFamily,syncHistoryResult,syncHistoryFinishedAt,type SyncHistoryRow} from '../src/management/sync-history.ts';
const row:SyncHistoryRow={id:'cron:1',source:'schedule',job_key:'kickon-live-football-sync',status:'succeeded',started_at:'2026-10-20T05:00:00Z',finished_at:null,last_succeeded_at:null,message:null,season:null,league_id:null,target_id:null,trigger_type:'cron',counts:null,quarantines:[]};
function client(data:unknown,error:unknown=null,check?:(name:string,args:unknown)=>void){return {rpc(name:string,args:unknown){check?.(name,args);return {abortSignal(signal:AbortSignal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({data,error});}};}} as unknown as SupabaseClient;}
test('execution history requests one server-paginated family and keeps scheduler success distinct from data success',async()=>{
 const result=await readSyncHistory(client({total:1,rows:[row]},null,(name,args)=>{assert.equal(name,'get_admin_sync_execution_history');assert.deepEqual(args,{p_task:'squad',p_page:3});}),'squad',3);
 assert.equal(syncHistoryResult(result.rows[0]).label,'예약 실행 완료');
 assert.equal(syncHistoryResult({...row,source:'run',status:'partial'}).label,'일부 보류');
 assert.equal(syncHistoryResult({...row,source:'state',status:'unknown'}).label,'결과 미확인');
 assert.equal(syncHistoryFamily('kickon-team-squad-retry'),'squad');assert.equal(syncHistoryFamily('team-squad:2026:kleague:seoul'),'squad');
 assert.equal(syncHistoryFamily('sportmonks-post-match-v2:2026:kleague'),'post-match');
 assert.equal(syncHistoryFamily('new-job'),'new-job');
 assert.deepEqual(await readSyncHistory(client({total:0,rows:[]}),'',1),{total:0,rows:[]});
});
test('missing, denied and malformed history evidence stays unknown instead of becoming an empty or successful result',async()=>{
 for(const data of [null,{}, {total:null,rows:[]},{total:0,rows:[row]},{total:11,rows:Array(11).fill(row)},...[
  {source:'other'},{started_at:null},{started_at:'invalid'},{finished_at:undefined},{season:'2026'},
  {counts:{}},{counts:{inserted:0,updated:0,skipped:-1,failed:0}},{quarantines:[{}]},{message:undefined},
 ].map(patch=>({total:1,rows:[{...row,...patch}]}))])await assert.rejects(readSyncHistory(client(data),'',1),/확인할 수 없어요/);
 await assert.rejects(readSyncHistory(client({total:0,rows:[]},{message:'denied'}),'',1),/확인할 수 없어요/);
 for(const [task,page] of [['',0],['',100001],['x'.repeat(201),1],['%',1]] as const)await assert.rejects(readSyncHistory(client(null),task,page),/확인할 수 없어요/);
});
test('completion uses the confirmed current success and never reuses an older success for a failed or pending attempt',()=>{
 const state={...row,source:'state' as const,last_succeeded_at:row.started_at};
 assert.equal(syncHistoryFinishedAt(state),row.started_at);
 for(const status of ['failed','unknown'])assert.equal(syncHistoryFinishedAt({...state,status}),null);
 assert.equal(syncHistoryFinishedAt({...state,last_succeeded_at:'2026-10-19T05:00:00Z'}),null);
 assert.equal(syncHistoryFinishedAt({...state,last_succeeded_at:null}),null);
 assert.equal(syncHistoryFinishedAt({...row,source:'run',status:'failed',finished_at:row.started_at}),row.started_at);
 assert.equal(syncHistoryFinishedAt({...row,source:'run',last_succeeded_at:row.started_at}),null);
});

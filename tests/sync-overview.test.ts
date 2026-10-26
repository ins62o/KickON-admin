import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readCronJobs} from '../src/management/sync-reads.ts';
import {automaticSyncJobs,cronResult,syncMessage,syncScheduleLabel,syncScope,syncStateResult,syncTask,type CronJob} from '../src/management/sync-model.ts';

const cron:CronJob={job_id:1,job_name:'kickon-live-football-sync',schedule:'* * * * *',active:true,last_status:'succeeded',last_started_at:null,last_finished_at:null,last_message:null,failure_count_24h:0};
test('automatic jobs include football, notifications, settlement, monitoring and housekeeping without changing the input',()=>{
 const names=['kickon-live-football-sync','kickon-post-match-football-sync','kickon-initial-football-history-backfill','kickon-team-squad-refresh','kickon-team-squad-retry','kickon-team-metrics-reconciliation'];
 assert.equal(new Set(names.map(name=>syncTask(name).name)).size,6);
 const all=[...names,'kickon-admin-resource-monitoring','kickon-push-outbox-recovery','kickon-football-provider-usage-retention','kickon-attendance-reminder','kickon-match-prediction-settlement','future-job'];
 const rows=all.map((job_name,job_id)=>({...cron,job_name,job_id}));
 assert.equal(automaticSyncJobs(rows).length,12);assert.deepEqual(rows.map(row=>row.job_name),all);
 assert.equal(new Set(all.map(name=>syncTask(name).name)).size,12);
 assert.equal(syncTask('kickon-push-outbox-recovery-dev').name,'푸시 발송 복구');
 assert.ok(syncTask('kickon-attendance-reminder').rules?.some(([,text])=>text.includes('한 번만')));
 assert.ok(syncTask('kickon-match-prediction-settlement').rules?.some(([,text])=>text.includes('500P')));
});
test('schedules use confirmed UTC cron settings and display recurring local times without inventing the next run',()=>{
 for(const [input,output] of [['* * * * *','매분'],['*/5 * * * *','5분마다'],['10 19 * * *','매일 04시 10분'],['40 19 * * *','매일 04시 40분'],['15-40/5 19 * * *','매일 04시 15분 ~ 40분 사이 5분마다'],['17 * * * *','매시간 17분']])assert.equal(syncScheduleLabel(input),output);
 for(const input of ['0 0 * * 1','not cron','99 19 * * *','0 24 * * *'])assert.equal(syncScheduleLabel(input),'사용자 지정 주기');
});
test('scheduler dispatch success stays distinct from data completion and pending work never inherits an older success',()=>{
 assert.deepEqual(cronResult('succeeded'),{label:'예약 실행 완료',tone:'neutral'});assert.equal(cronResult(null).label,'기록 없음');
 const row={last_attempted_at:'2026-10-20T00:00:00Z',last_succeeded_at:'2026-10-19T00:00:00Z',last_error:null};
 assert.equal(syncStateResult(row).label,'결과 미확인');assert.equal(syncStateResult({...row,last_error:'failed'}).label,'갱신 오류');
 assert.equal(syncStateResult({...row,last_succeeded_at:row.last_attempted_at}).label,'갱신 완료');assert.equal(syncStateResult({...row,last_succeeded_at:'invalid'}).label,'결과 미확인');
});
test('current and legacy scopes retain recorded league information and identify exact team IDs',()=>{
 const teams=[{id:'seoul',name:'FC 서울',short_name:'서울',code:'SEO',sportmonks_id:null},{id:'seoul-eland',name:'서울 이랜드',short_name:'서울E',code:'SEL',sportmonks_id:null}];
 for(const sync_key of ['team-squad:2026:kleague2:seoul-eland','team-squad-kleague2-2026-seoul-eland','team-squad-2026-seoul-eland:2026:kleague2']){
  const scope=syncScope({sync_key,league_id:null,season:null,last_attempted_at:null,last_succeeded_at:null,last_error:null},teams);assert.equal(scope.league,'kleague2');assert.equal(scope.season,2026);assert.equal(scope.team?.id,'seoul-eland');
 }
 assert.equal(syncScope({sync_key:'unknown',league_id:null,season:null,last_attempted_at:null,last_succeeded_at:null,last_error:null}).league,null);
});
test('operator messages hide credential-like values',()=>{
 const value=syncMessage('Bearer abc.def.ghi api_token=private-value sbp_examplevalue');assert.ok(!value.includes('abc.def.ghi'));assert.ok(!value.includes('private-value'));assert.ok(!value.includes('sbp_examplevalue'));
});
test('cron reads reuse the existing admin RPC and do not turn denied or incomplete responses into zero jobs',async()=>{
 const client=(data:unknown,error:unknown=null)=>({rpc:async(name:string)=>{assert.equal(name,'get_admin_cron_jobs');return {data,error};}} as unknown as SupabaseClient);
 assert.deepEqual(await readCronJobs(client([cron])),[cron]);assert.deepEqual(await readCronJobs(client([])),[]);
 await assert.rejects(readCronJobs(client(null,{message:'denied'})),/불러오지/);await assert.rejects(readCronJobs(client(null)),/불러오지/);await assert.rejects(readCronJobs(client([{...cron,failure_count_24h:null}])) ,/확인하지/);
});

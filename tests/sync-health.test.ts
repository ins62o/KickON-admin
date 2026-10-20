import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {automaticSyncErrors,automaticSyncLight,liveLeagueLight,schedulerLight,type SyncHealth,type LiveLeagueHealth} from '../src/management/sync-health.ts';
import {readSyncHealth} from '../src/management/sync-reads.ts';
import type {CronJob} from '../src/management/sync-model.ts';
const at='2026-10-20T05:30:00Z',now=Date.parse(at),old='2026-10-19T00:00:00Z';
const job:CronJob={job_id:1,job_name:'kickon-live-football-sync',schedule:'* * * * *',active:true,last_status:'succeeded',last_started_at:at,last_finished_at:at,last_message:null,failure_count_24h:0};
const league:LiveLeagueHealth={league_id:'kleague',paused:false,lineup_targets:0,live_targets:0,postponed_targets:0,due_since:null,lineup_poll_at:null,lineup_http_status:null,live_poll_at:null,live_http_status:null};
const snapshot=():SyncHealth=>({checked_at:at,jobs:[job],states:[],maintenance:[],live:{last_attempted_at:at,last_succeeded_at:at,has_error:false,running:false,leagues:[{...league},{...league,league_id:'kleague2'}]}});
test('scheduler lights distinguish disabled, failed, delayed and unsupported records with daily/range grace',()=>{
 assert.equal(schedulerLight({...job,active:false,last_status:'failed'},now).tone,'gray');
 assert.equal(schedulerLight({...job,last_status:'failed'},now).tone,'red');
 assert.equal(schedulerLight({...job,last_started_at:old},now).label,'실행 지연');
 assert.equal(schedulerLight({...job,schedule:'0 0 * * 1'},now).tone,'gray');
 assert.equal(schedulerLight({...job,last_started_at:null},now).tone,'gray');
 const daily={...job,schedule:'10 19 * * *',last_started_at:'2026-10-18T19:10:00Z'};
 assert.equal(schedulerLight(daily,Date.parse('2026-10-19T19:12:00Z')).tone,'green');
 assert.equal(schedulerLight(daily,Date.parse('2026-10-19T19:14:00Z')).tone,'red');
 assert.equal(schedulerLight({...job,schedule:'15-40/5 19 * * *',last_started_at:'2026-10-19T19:40:00Z'},now).tone,'green');
});
test('no-match green requires an actual recent worker heartbeat, never scheduler success alone',()=>{
 const health=snapshot();assert.equal(automaticSyncLight(job,health).label,'정상 대기');
 health.live.last_succeeded_at=old;assert.equal(automaticSyncLight(job,health).tone,'red');
 health.live.running=true;assert.equal(automaticSyncLight(job,health).label,'대상 확인 중');
 health.live.last_attempted_at=old;assert.equal(automaticSyncLight(job,health).tone,'red');
 assert.equal(automaticSyncLight(job,health,'read failed').tone,'gray');
 assert.equal(automaticSyncLight(job,null).tone,'gray');
});
test('lineup and in-play lights require every needed current response and retain failure/paused/unknown states',()=>{
 const health=snapshot(),live=health.live;
 const targets={...league,lineup_targets:1,live_targets:1,due_since:old,lineup_poll_at:at,lineup_http_status:200};
 assert.equal(liveLeagueLight(targets,live,now).tone,'red');
 assert.equal(liveLeagueLight({...targets,due_since:at},live,now).tone,'gray');
 const good={...targets,live_poll_at:at,live_http_status:200};
 assert.equal(liveLeagueLight(good,live,now).label,'경기 조회 정상');
 assert.equal(liveLeagueLight({...good,live_http_status:429},live,now).label,'조회 오류');
 assert.equal(liveLeagueLight({...good,lineup_poll_at:old},live,now).tone,'red');
 assert.equal(liveLeagueLight({...good,paused:true},live,now).tone,'gray');
 assert.equal(liveLeagueLight({...good,paused:null},live,now).tone,'gray');
 assert.equal(liveLeagueLight(good,{...live,has_error:true},now).tone,'red');
 assert.equal(liveLeagueLight({...good,live_poll_at:'2099-01-01'},live,now).tone,'red');
});
test('one healthy league cannot mask another league error and inactive scheduler overrides provider success',()=>{
 const health=snapshot();health.live.leagues[1]={...league,league_id:'kleague2',live_targets:1,due_since:old};
 assert.equal(automaticSyncLight(job,health).tone,'red');assert.equal(automaticSyncLight({...job,active:false},health).tone,'gray');
 health.live.leagues[1]={...league,league_id:'kleague2',paused:true};assert.equal(automaticSyncLight(job,health).label,'수집 중단');
});
test('non-live lights name scheduler evidence separately and report current data failures',()=>{
 const health=snapshot(),squad={...job,job_name:'kickon-team-squad-refresh'};
 assert.equal(automaticSyncLight(squad,health).label,'예약 정상');
 health.states=[{sync_key:'team-squad:2026:kleague:seoul',season:2026,league_id:'kleague',last_attempted_at:at,last_succeeded_at:old,last_error:'failure'}];
 assert.equal(automaticSyncLight(squad,health).tone,'red');
 health.states[0].last_error=null;assert.equal(automaticSyncLight(squad,health).tone,'gray');
 health.states[0].last_succeeded_at=at;assert.equal(automaticSyncLight(squad,health).label,'갱신 성공');
});
test('old unresolved errors and maintenance blocks survive new successful scheduler calls',()=>{
 const health=snapshot(),post={...job,job_name:'kickon-post-match-football-sync'};
 health.jobs=[post];health.states=[{sync_key:'sportmonks-post-match:2026:kleague',season:2026,league_id:'kleague',last_attempted_at:old,last_succeeded_at:'2026-10-17T00:00:00Z',last_error:'SYNC_ERROR'}];
 assert.equal(automaticSyncLight(post,health).tone,'red');assert.equal(automaticSyncErrors([post],health).count,1);
 health.states[0].last_error=null;
 health.maintenance=[{league_id:'kleague',season:2026,kind:'post_match',state:'BLOCKED',reason_code:'PROVIDER_FINISHED_REQUIRED'},{league_id:'kleague2',season:2026,kind:'post_match',state:'BLOCKED',reason_code:'FINISHED_ONLY'}];
 assert.equal(automaticSyncErrors([post],health).count,1,'Count jobs, not leagues or attempts');
 assert.match(automaticSyncLight(post,health).detail,/K리그 1.*종료 확인.*K리그 2/);
 health.maintenance=[];assert.equal(automaticSyncErrors([post],health).count,0);
});
test('unavailable or incomplete health never reports zero errors',()=>{
 const health=snapshot();assert.equal(automaticSyncErrors([job],null).count,null);assert.equal(automaticSyncErrors([job],health,'denied').count,null);
 assert.equal(automaticSyncErrors([{...job,last_started_at:null}],health).count,null);
 assert.equal(automaticSyncErrors([{...job,last_status:'failed'}],health).count,1);
});
test('health RPC validates evidence and keeps denied, missing or malformed responses unknown',async()=>{
 const client=(data:unknown,error:unknown=null)=>({rpc(name:string){assert.equal(name,'get_admin_football_sync_health');return {abortSignal(signal:AbortSignal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({data,error});}};}} as unknown as SupabaseClient);
 assert.deepEqual(await readSyncHealth(client(snapshot())),snapshot());
 for(const data of [null,{}, {...snapshot(),checked_at:'invalid'},{...snapshot(),live:{...snapshot().live,leagues:[league,league]}},{...snapshot(),live:{...snapshot().live,leagues:[league,{...league,league_id:'kleague2',lineup_targets:null}]}}])await assert.rejects(readSyncHealth(client(data)),/확인/);
 await assert.rejects(readSyncHealth(client(snapshot(),{message:'denied'})),/확인/);
});

import type {SupabaseClient} from '@supabase/supabase-js';
import {cronResult,syncRunResult} from './sync-model.ts';

export type SyncHistoryRow={id:string;source:'schedule'|'run'|'state';job_key:string;status:string;started_at:string;finished_at:string|null;last_succeeded_at:string|null;message:string|null;season:number|null;league_id:string|null;target_id:string|null;trigger_type:string|null;counts:{inserted:number|null;updated:number|null;skipped:number|null;failed:number|null}|null;quarantines:{name:string;reason:string}[]};
export type SyncHistory={total:number;rows:SyncHistoryRow[]};
export const historySources={schedule:'예약 실행',run:'데이터 처리',state:'최근 처리 상태'};
const families:[RegExp,string][]=[[/push-outbox-recovery/,'push'],[/attendance-reminder/,'attendance'],[/match-prediction-settlement/,'prediction'],[/admin-resource-monitoring/,'resources'],[/football-provider-usage-retention/,'retention'],[/post-match/,'post-match'],[/history/,'history'],[/squad/,'squad'],[/team-metrics/,'metrics'],[/live/,'live'],[/lineup/,'lineup'],[/goal-backfill/,'goals']];
export const syncHistoryFamily=(key:string)=>families.find(([pattern])=>pattern.test(key))?.[1]??key;
export function syncHistoryFinishedAt(row:SyncHistoryRow){
 if(row.source!=='state')return row.finished_at;
 return row.status==='succeeded'&&Date.parse(row.last_succeeded_at??'')>=Date.parse(row.started_at)?row.last_succeeded_at:null;
}
export function syncHistoryResult(row:SyncHistoryRow){
 if(row.source==='schedule')return cronResult(row.status);
 if(row.source==='state')return row.status==='succeeded'?{label:'갱신 완료',tone:'green'}:row.status==='failed'?{label:'갱신 오류',tone:'orange'}:{label:'결과 미확인',tone:'neutral'};
 return syncRunResult(row.status);
}
export async function readSyncHistory(client:SupabaseClient,task:string,page:number):Promise<SyncHistory>{
 const invalid=()=>Error('자동 동기화 실행 내역을 확인할 수 없어요 다시 시도해 주세요');
 if(typeof task!=='string'||task.length>200||task&&!/^[A-Za-z0-9_-]+$/.test(task)||!Number.isSafeInteger(page)||page<1||page>100000)throw invalid();
 const {data,error}=await client.rpc('get_admin_sync_execution_history',{p_task:task||null,p_page:page}).abortSignal(AbortSignal.timeout(10000));
 if(error||!data||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.rows)||data.rows.length>10||data.rows.length>data.total)throw invalid();
 const at=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const nullableText=(value:unknown)=>value===null||typeof value==='string';
 if(data.rows.some((row:SyncHistoryRow)=>!row||typeof row.id!=='string'||!['schedule','run','state'].includes(row.source)||typeof row.job_key!=='string'||typeof row.status!=='string'||!at(row.started_at)||[row.finished_at,row.last_succeeded_at].some(value=>value!==null&&!at(value))||[row.message,row.league_id,row.target_id,row.trigger_type].some(value=>!nullableText(value))||row.season!==null&&(!Number.isInteger(row.season)||row.season<1900||row.season>2200)||row.counts!==null&&(!row.counts||['inserted','updated','skipped','failed'].some(key=>{const value=row.counts![key as keyof typeof row.counts];return value!==null&&(!Number.isSafeInteger(value)||value<0);}))||!Array.isArray(row.quarantines)||row.quarantines.some(item=>!item||typeof item.name!=='string'||typeof item.reason!=='string')))throw invalid();
 return data as SyncHistory;
}

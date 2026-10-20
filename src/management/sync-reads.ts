import type {SupabaseClient} from '@supabase/supabase-js';
import type {CronJob} from './sync-model.ts';
import type {SyncHealth} from './sync-health.ts';

function cronRows(data:unknown):CronJob[]{
 if(!Array.isArray(data))throw Error('자동 동기화 설정을 불러오지 못했어요 다시 시도해 주세요');
 const rows=data as CronJob[];
 if(rows.some(row=>!row||!Number.isSafeInteger(row.job_id)||row.job_id<1||typeof row.job_name!=='string'||typeof row.schedule!=='string'||typeof row.active!=='boolean'||!Number.isSafeInteger(row.failure_count_24h)||row.failure_count_24h<0||[row.last_status,row.last_started_at,row.last_finished_at,row.last_message].some(value=>value!==null&&typeof value!=='string')))throw Error('자동 동기화 설정과 실행 기록을 확인하지 못했어요');
 return rows;
}

export async function readCronJobs(client:SupabaseClient):Promise<CronJob[]>{
 const result=await client.rpc('get_admin_cron_jobs');
 if(result.error||!Array.isArray(result.data))throw Error('자동 동기화 설정을 불러오지 못했어요 다시 시도해 주세요');
 return cronRows(result.data);
}
export async function readSyncHealth(client:SupabaseClient):Promise<SyncHealth>{
 const {data,error}=await client.rpc('get_admin_football_sync_health').abortSignal(AbortSignal.timeout(10000));
 const invalid=()=>Error('동기화 상태를 확인할 수 없어요 잠시 후 다시 시도해 주세요');
 if(error||!data||typeof data!=='object')throw invalid();
 const value=data as SyncHealth;
 const timestamp=(at:unknown)=>at===null||typeof at==='string'&&Number.isFinite(Date.parse(at));
 if(!value.checked_at||!timestamp(value.checked_at)||!Array.isArray(value.states)||!value.live||typeof value.live.has_error!=='boolean'||typeof value.live.running!=='boolean'||!timestamp(value.live.last_attempted_at)||!timestamp(value.live.last_succeeded_at)||!Array.isArray(value.live.leagues)||value.live.leagues.length!==2)throw invalid();
 cronRows(value.jobs);
 if(value.states.some(row=>!row||typeof row.sync_key!=='string'||!timestamp(row.last_attempted_at)||!timestamp(row.last_succeeded_at)||(row.last_error!==null&&typeof row.last_error!=='string')))throw invalid();
 const seen=new Set<string>();
 for(const league of value.live.leagues){
  if(!league||!['kleague','kleague2'].includes(league.league_id)||seen.has(league.league_id)||![true,false,null].includes(league.paused)||[league.lineup_targets,league.live_targets,league.postponed_targets].some(count=>!Number.isSafeInteger(count)||count<0)||[league.due_since,league.lineup_poll_at,league.live_poll_at].some(at=>!timestamp(at))||[league.lineup_http_status,league.live_http_status].some(code=>code!==null&&(!Number.isSafeInteger(code)||code<0||code>599)))throw invalid();
  seen.add(league.league_id);
 }
 return value;
}

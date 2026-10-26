import type {SupabaseClient} from '@supabase/supabase-js';
import {isPushKind,isPushResultFilter,isPushPhaseFilter,pushFailureReasons,type PushKind,type PushRecipient,type PushResultFilter,type PushPhaseFilter,type PushFailureEvidence} from './push-model.ts';

export type PushMode='OFF'|'SHADOW'|'ALLOWLIST'|'FULL';
export type PushType='MATCH'|'LINEUP'|'COMMUNITY'|'ATTENDANCE'|'SYSTEM';
export type PushOverview={checked_at:string;day_start:string;day_end:string;total_users:number;enabled_users:number;disabled_users:number;unknown_users:number;today_succeeded:number;today_failed:number;today_partial:number;today_expired:number;today_unknown:number;today_no_target:number;today_excluded:number;pending:number;lineup_enabled_users:number;match_enabled_users:number;community_enabled_users:number;match_partial_users:number};
export async function readPushOverview(client:SupabaseClient):Promise<PushOverview>{
 const {data,error}=await client.rpc('get_admin_push_overview').abortSignal(AbortSignal.timeout(10000));
 const invalid=()=>Error('푸시 알림 집계를 확인할 수 없어요 다시 시도해 주세요');
 if(error||!data||['checked_at','day_start','day_end'].some(key=>typeof data[key]!=='string'||!Number.isFinite(Date.parse(data[key])))||['total_users','enabled_users','disabled_users','unknown_users','today_succeeded','today_failed','today_partial','today_expired','today_unknown','today_no_target','today_excluded','pending','lineup_enabled_users','match_enabled_users','community_enabled_users','match_partial_users'].some(key=>!Number.isSafeInteger(data[key])||data[key]<0)||data.total_users!==data.enabled_users+data.disabled_users+data.unknown_users)throw invalid();
 if(['lineup_enabled_users','match_enabled_users','community_enabled_users','match_partial_users'].some(key=>data[key]>data.enabled_users))throw invalid();
 const checked=Date.parse(data.checked_at),start=Date.parse(data.day_start),end=Date.parse(data.day_end);
 if(start>checked||checked>=end||end-start!==86400000||new Date(start+9*3600000).toISOString().slice(11)!=='00:00:00.000Z')throw invalid();
 return data as PushOverview;
}
export type PushSettings={checked_at:string;global_disabled:boolean;max_attempts:number;base_retry_delay_seconds:number;max_retry_delay_seconds:number;notifications:{type:PushType;domain:'MATCH'|'COMMUNITY'|null;mode:PushMode}[]};
export async function readPushSettings(client:SupabaseClient):Promise<PushSettings>{
 const {data,error}=await client.rpc('get_admin_push_settings').abortSignal(AbortSignal.timeout(10000));
 const invalid=()=>Error('푸시 알림 설정을 확인할 수 없어요 다시 시도해 주세요');
 if(error||!data||typeof data!=='object')throw invalid();
 const value=data as PushSettings,types=['MATCH','LINEUP','COMMUNITY','ATTENDANCE','SYSTEM'];
 if(typeof value.checked_at!=='string'||!Number.isFinite(Date.parse(value.checked_at))||typeof value.global_disabled!=='boolean'||!Array.isArray(value.notifications)||value.notifications.length!==types.length||[value.max_attempts,value.base_retry_delay_seconds,value.max_retry_delay_seconds].some(number=>!Number.isSafeInteger(number)||number<1)||value.base_retry_delay_seconds>value.max_retry_delay_seconds)throw invalid();
 const seen=new Set<string>();
 for(const row of value.notifications){
  if(!row||!types.includes(row.type)||seen.has(row.type)||![null,'MATCH','COMMUNITY'].includes(row.domain)||!['OFF','SHADOW','ALLOWLIST','FULL'].includes(row.mode)||value.global_disabled&&row.mode!=='OFF')throw invalid();
  seen.add(row.type);
 }
 return value;
}
export type PushRecipients={total:number;rows:PushRecipient[]};
export async function readPushRecipients(client:SupabaseClient,kind:PushKind,query:string,page:number,result:PushResultFilter='all',phase:PushPhaseFilter='all'):Promise<PushRecipients>{
 const invalid=()=>Error('푸시 발송 내역을 확인할 수 없어요 다시 시도해 주세요');
 if(!isPushKind(kind)||!isPushResultFilter(result)||!isPushPhaseFilter(phase)||kind!=='match'&&phase!=='all'||typeof query!=='string'||query.length>100||!Number.isSafeInteger(page)||page<1||page>1000000)throw invalid();
 const {data,error}=await client.rpc('get_admin_push_recipients',{p_kind:kind==='match'?'match_events':kind,p_query:query.trim(),p_page:page,p_result:result,p_phase:phase}).abortSignal(AbortSignal.timeout(10000));
 if(error)throw invalid();
 return checkedPushRecipients(data);
}
function checkedPushRecipients(data:unknown):PushRecipients{
 const invalid=()=>Error('푸시 발송 내역을 확인할 수 없어요 다시 시도해 주세요');
 const value=data as PushRecipients;
 if(!data||typeof data!=='object'||!Number.isSafeInteger(value.total)||value.total<0||!Array.isArray(value.rows)||value.rows.length>10||value.rows.length>value.total)throw invalid();
 const timestamp=(at:unknown)=>at===null||typeof at==='string'&&Number.isFinite(Date.parse(at));
 for(const row of value.rows as PushRecipient[]){
  if(!row||row.team!==null&&(!row.team||typeof row.team.id!=='string'||typeof row.team.name!=='string'||typeof row.team.code!=='string')||typeof row.id!=='string'||typeof row.user_id!=='string'||typeof row.status!=='string'||row.phase!==undefined&&row.phase!==null&&typeof row.phase!=='string'||typeof row.created_at!=='string'||!timestamp(row.created_at)||!timestamp(row.last_attempted_at)||[row.nickname,row.title,row.body,row.last_error_code].some(value=>value!==null&&typeof value!=='string')||[row.attempts,row.targets,row.succeeded,row.failed,row.pending,row.unknown,row.shadowed,row.suppressed].some(value=>!Number.isSafeInteger(value)||value<0)||row.succeeded+row.failed+row.pending+row.unknown+row.shadowed+row.suppressed>row.targets)throw invalid();
 }
 return value;
}

export type PushMetric='enabled'|'success'|'failure'|'pending';
export type PushDeliveryOutcome='success'|'partial'|'failure'|'expired'|'unknown'|'no_target'|'excluded'|'pending';
export type PushFailureReason='all'|'failure'|'partial'|'expired'|'unknown'|'no_target'|'excluded';
export type PushMetricRecipient=PushRecipient&{kind:PushKind;metric_at:string|null;completed_at:string|null;delivery_outcome:PushDeliveryOutcome;expired:number;failure_reasons:PushFailureEvidence[];expires_at:string|null;targets_materialized_at:string|null};
export async function readPushMetricRecipients(client:SupabaseClient,metric:Exclude<PushMetric,'enabled'>,query:string,page:number,reason:PushFailureReason='all'):Promise<{total:number;rows:PushMetricRecipient[]}>{
 const invalid=()=>Error('푸시 발송 내역을 확인할 수 없어요 다시 시도해 주세요');
 if(!['success','failure','pending'].includes(metric)||!pushFailureReasons.some(option=>option.value===reason)||metric!=='failure'&&reason!=='all'||typeof query!=='string'||query.length>100||!Number.isSafeInteger(page)||page<1||page>1000000)throw invalid();
 const {data,error}=await client.rpc('get_admin_push_metric_recipients',{p_metric:metric==='failure'&&reason!=='all'?reason==='failure'?'delivery_failure':reason:metric,p_query:query.trim(),p_page:page}).abortSignal(AbortSignal.timeout(10000));
 if(error)throw invalid();
 const result=checkedPushRecipients(data);
 for(const row of result.rows as PushMetricRecipient[])if((metric==='failure'?!['failure','partial','expired','unknown','no_target','excluded'].includes(row.delivery_outcome)||reason!=='all'&&row.delivery_outcome!==reason:row.delivery_outcome!==metric)||!Number.isSafeInteger(row.expired)||row.expired<0||row.expired>row.suppressed||!Array.isArray(row.failure_reasons)||row.failure_reasons.some(reason=>!reason||typeof reason.code!=='string'||!reason.code.trim()||reason.count!==null&&(!Number.isSafeInteger(reason.count)||reason.count<1||reason.count>row.targets))||row.failure_reasons.reduce((n,reason)=>n+(reason.count??0),0)>row.targets||!isPushKind(row.kind)||[row.metric_at,row.completed_at,row.expires_at,row.targets_materialized_at].some(at=>at!==null&&(typeof at!=='string'||!Number.isFinite(Date.parse(at)))))throw invalid();
 return result as {total:number;rows:PushMetricRecipient[]};
}
export type PushEnabledUser={user_id:string;nickname:string|null;team:PushRecipient['team'];match_enabled:boolean|null;goal_enabled:boolean|null;lineup_enabled:boolean|null;community_enabled:boolean|null;enabled:true};
export async function readPushEnabledUsers(client:SupabaseClient,query:string,page:number):Promise<{total:number;rows:PushEnabledUser[]}>{
 const invalid=()=>Error('알림을 켠 사용자 목록을 확인할 수 없어요 다시 시도해 주세요');
 if(typeof query!=='string'||query.length>100||!Number.isSafeInteger(page)||page<1||page>1000000)throw invalid();
 const {data,error}=await client.rpc('get_admin_push_enabled_users',{p_query:query.trim(),p_page:page}).abortSignal(AbortSignal.timeout(10000));
 if(error||!data||!Number.isSafeInteger(data.total)||data.total<0||!Array.isArray(data.rows)||data.rows.length>10||data.rows.length>data.total)throw invalid();
 for(const row of data.rows as PushEnabledUser[]){
  if(!row||typeof row.user_id!=='string'||!row.user_id||row.nickname!==null&&typeof row.nickname!=='string'||row.team!==null&&(!row.team||typeof row.team.id!=='string'||typeof row.team.name!=='string'||typeof row.team.code!=='string')||row.enabled!==true)throw invalid();
  const preferences=[row.match_enabled,row.goal_enabled,row.lineup_enabled,row.community_enabled];
  if(preferences.some(value=>value!==null&&typeof value!=='boolean')||!preferences.some(value=>value===true))throw invalid();
 }
 return data as {total:number;rows:PushEnabledUser[]};
}

export type PushRecipientDiagnosis={version:1;captured_at:string;stage:'target_selection'|'closed_before_selection';notification_type:string|null;phase:string|null;preference_exists:boolean;match_enabled:boolean|null;goal_enabled:boolean|null;lineup_enabled:boolean|null;community_enabled:boolean|null;registered_devices:number|null;selected_devices:number|null;duplicate_devices:number|null;outcome:'NO_REGISTERED_DEVICE'|'TARGETS_SELECTED'|'CLOSED_BEFORE_SELECTION'};
function validRecipientDiagnosis(value:unknown):value is PushRecipientDiagnosis{
 if(!value||typeof value!=='object')return false;
 const row=value as Record<string,unknown>;
 if(row.version!==1||typeof row.captured_at!=='string'||!Number.isFinite(Date.parse(row.captured_at))||typeof row.preference_exists!=='boolean'
  ||['notification_type','phase'].some(key=>row[key]!==null&&typeof row[key]!=='string')
  ||['match_enabled','goal_enabled','lineup_enabled','community_enabled'].some(key=>row[key]!==null&&typeof row[key]!=='boolean'||row.preference_exists===false&&row[key]!==null))return false;
 if(row.stage==='closed_before_selection')return row.outcome==='CLOSED_BEFORE_SELECTION'&&['registered_devices','selected_devices','duplicate_devices'].every(key=>row[key]===null);
 if(row.stage!=='target_selection'||['registered_devices','selected_devices','duplicate_devices'].some(key=>!Number.isSafeInteger(row[key])||(row[key] as number)<0))return false;
 return row.registered_devices===(row.selected_devices as number)+(row.duplicate_devices as number)
  &&row.outcome===(row.selected_devices===0?'NO_REGISTERED_DEVICE':'TARGETS_SELECTED');
}

export type PushDeliveryDetail=Pick<PushRecipient,'status'|'created_at'|'last_attempted_at'|'last_error_code'|'attempts'|'targets'|'succeeded'|'failed'|'pending'|'unknown'|'shadowed'|'suppressed'>&{completed_at:string|null;last_success_at:string|null;current_preference:boolean|null;recipient_diagnosis?:PushRecipientDiagnosis|null;reasons:{code:string;count:number|null}[]};
export async function readPushDeliveryDetail(client:SupabaseClient,outboxId:string):Promise<PushDeliveryDetail>{
 const invalid=()=>Error('푸시 발송 상세를 확인할 수 없어요 다시 시도해 주세요');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outboxId))throw invalid();
 const {data,error}=await client.rpc('get_admin_push_delivery_detail',{p_outbox_id:outboxId}).abortSignal(AbortSignal.timeout(10000));
 if(error||!data||data.recipient_diagnosis!=null&&!validRecipientDiagnosis(data.recipient_diagnosis)||data.current_preference!==null&&typeof data.current_preference!=='boolean'||typeof data.status!=='string'||typeof data.created_at!=='string'||!Number.isFinite(Date.parse(data.created_at))||[data.completed_at,data.last_success_at,data.last_attempted_at].some(value=>value!==null&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))||data.last_error_code!==null&&typeof data.last_error_code!=='string'||['attempts','targets','succeeded','failed','pending','unknown','shadowed','suppressed'].some(key=>!Number.isSafeInteger(data[key])||data[key]<0)||data.succeeded+data.failed+data.pending+data.unknown+data.shadowed+data.suppressed>data.targets||!Array.isArray(data.reasons)||data.reasons.some((reason:{code:unknown;count:unknown}|null)=>!reason||typeof reason.code!=='string'||!reason.code.trim()||reason.count!==null&&(!Number.isSafeInteger(reason.count)||(reason.count as number)<1)))throw invalid();
 return data as PushDeliveryDetail;
}

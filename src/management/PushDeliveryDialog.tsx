import {useCallback} from 'react';
import {readPushDeliveryDetail} from './data';
import {pushDeliveryReason,pushRecipientStatus,type PushRecipient} from './push-model';
import {useResource} from './useResource';
import {Badge,Dialog,Empty,WorkspaceSkeleton} from './WorkspaceUI';
import {TeamMark} from './TeamMark';
import {fixtureDateLabel} from './fixture-schedule';
import {syncMessage} from './sync-model';

export function PushDeliveryDialog({recipient,onClose}:{recipient:PushRecipient;onClose:()=>void}){
 const loader=useCallback(()=>readPushDeliveryDetail(recipient.id),[recipient.id]),resource=useResource(loader),data=resource.data;
 const diagnosis=data?.recipient_diagnosis;
 const preference=(value:boolean|null)=>value===true?'ON':value===false?'OFF':'확인 불가';
 const recordedPreference=diagnosis?.notification_type==='LINEUP'?diagnosis.lineup_enabled:diagnosis?.notification_type==='COMMUNITY'?diagnosis.community_enabled:['MATCH','ATTENDANCE'].includes(diagnosis?.notification_type??'')?diagnosis?.match_enabled:null;
 const status=data?pushRecipientStatus({...recipient,...data}):null;
 const time=(value:string|null)=>value?fixtureDateLabel(value):'기록 없음';
 return <Dialog title="푸시 발송 상세" onClose={onClose} className="push-delivery-dialog">
  <div className="push-delivery-user"><span className="push-recipient-user"><TeamMark team={recipient.team??undefined}/><b>{recipient.nickname||'닉네임 없음'}</b></span>{status?<Badge tone={status.tone}>{status.label}</Badge>:null}</div>
  {resource.loading?<WorkspaceSkeleton/>:resource.error?<Empty error={resource.error} retry={resource.reload}/>:data&&status?<>
   <dl className="workspace-details">{[
    ['알림',recipient.title??'알림 원문 없음'],...(recipient.body!==null?[['알림 내용',recipient.body]]:[]),['현재 앱 알림 설정',data.current_preference===true?'ON':data.current_preference===false?'OFF':'확인 불가'],['대상 생성',time(data.created_at)],
    ...(diagnosis?[['대상 확인 시각',time(diagnosis.captured_at)],['대상 확인 단계',diagnosis.stage==='target_selection'?'기기 선정':'기기 선정 전 처리 종료'],['당시 앱 알림 설정',diagnosis.preference_exists?preference(recordedPreference??null):'설정 정보 없음'],
     ...(['GOAL','GOAL_CANCELLED'].includes(diagnosis.phase??'')?[['당시 득점 알림 설정',preference(diagnosis.goal_enabled)]]:[]),
     ['당시 등록 기기',diagnosis.registered_devices===null?'선정 전 종료로 미확인':`${diagnosis.registered_devices.toLocaleString('ko-KR')}개`],
     ...(diagnosis.duplicate_devices?[['중복 제외 기기',`${diagnosis.duplicate_devices.toLocaleString('ko-KR')}개`]]:[])]:[]),
    ...(data.succeeded>0?[['최근 접수 성공',time(data.last_success_at)],['접수된 기기',`${data.succeeded.toLocaleString('ko-KR')}개`]]:[]),
    ['최근 발송 시도',time(data.last_attempted_at)],['처리 종료',time(data.completed_at)],['발송 시도',`${data.attempts.toLocaleString('ko-KR')}회`],['대상 기기',`${data.targets.toLocaleString('ko-KR')}개`],
    ...(data.failed>0?[['실패한 기기',`${data.failed.toLocaleString('ko-KR')}개`]]:[]),...(data.suppressed>0?[['제외된 기기',`${data.suppressed.toLocaleString('ko-KR')}개`]]:[]),
   ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   {status.label!=='발송 성공'||data.reasons.length?<section className="push-delivery-reasons"><h3>{status.label==='발송 대상 없음'?'미발송 사유':status.label==='발송 제외'?'제외 사유':status.label==='발송 실패'?'실패 사유':'기록된 사유'}</h3>{data.reasons.length?data.reasons.map(reason=><div key={reason.code}><p><span>{pushDeliveryReason(reason.code)}</span>{reason.count!==null?<span> · {reason.count.toLocaleString('ko-KR')}개 기기</span>:null}</p><code>{syncMessage(reason.code)}</code></div>):<p>{status.label==='발송 대상 없음'?diagnosis?.outcome==='NO_REGISTERED_DEVICE'?'대상 기기를 확인할 때 이 사용자에게 등록된 푸시 기기가 0개여서 발송을 시도하지 않았어요 기기가 등록되지 않은 이유와 휴대폰의 알림 권한은 확인할 수 없어요':diagnosis?'기기 선정 당시 기록과 최종 발송 대상이 일치하지 않아요 기록된 처리 사유를 확인해야 해요':'이 알림의 수신 대상이 등록되지 않아 발송을 시도하지 않았어요 알림 OFF가 원인이었는지는 당시 기록이 없어 확인할 수 없어요':status.label==='발송 제외'?'구체적인 제외 사유가 기록되지 않았어요 알림 OFF 여부는 이 기록만으로 확인할 수 없어요':'구체적인 사유가 기록되지 않았어요'}</p>}</section>:null}
   <p className="push-preference-note">현재 앱 알림 설정은 조회 시점 기준이에요 · 발송 당시 설정과 휴대폰의 알림 권한은 이 값으로 확인할 수 없어요</p>
   {data.succeeded>0?<p className="system-note">발송 성공은 푸시 서버 접수 기준이에요 · 실제 기기 수신·읽음 여부는 수집하지 않아요</p>:null}
  </>:null}
 </Dialog>;
}

import {useCallback} from 'react';
import {readPushDeliveryDetail} from './data';
import {pushAttemptStage,pushDeliveryReason,pushDiagnosticCode,pushEvidenceTime,pushFailureNextCheck,pushNoTargetDiagnosis,pushRecipientStatus,type PushRecipient} from './push-model';
import type {PushDeliveryDetail} from './push-settings';
import {useResource} from './useResource';
import {Badge,Dialog,Empty,WorkspaceSkeleton} from './WorkspaceUI';
import {TeamMark} from './TeamMark';

const time=(value:string|null)=>value?pushEvidenceTime(value):'기록 없음';

function AttemptHistory({data}:{data:PushDeliveryDetail}){
 const diagnostics=data.diagnostics;
 return <section className="push-attempt-history" aria-label="전송 시도 기록">
  <h3>전송 시도 기록</h3>
  {!diagnostics?<p className="system-note">현재 조회에서는 시도별 상세가 제공되지 않아 공급자 HTTP 응답·오류 분류·재시도 예약을 확인할 수 없어요</p>:<>
   <p className="system-note">총 {data.attempts.toLocaleString('ko-KR')}회{diagnostics.truncated?' 중 최근 '+diagnostics.attempts.length.toLocaleString('ko-KR')+'회 표시':''} · 발송 작업 재시도 {diagnostics.next_retry_at?time(diagnostics.next_retry_at):'조회 시점 예약 없음'}</p>
   {diagnostics.attempts.length?diagnostics.attempts.map((attempt,index)=><details className="push-attempt" key={attempt.id} open={index===0}>
    <summary>{attempt.platform==='android'?'Android':attempt.platform==='ios'?'iPhone':'플랫폼 미확인'} · 기기별 {attempt.attempt_number.toLocaleString('ko-KR')}회차 · {time(attempt.attempted_at)}</summary>
    <dl className="workspace-details">{[
     ['코드 기준 단계',pushAttemptStage(attempt)],['처리 상태',pushDiagnosticCode(attempt.status)],['결과 분류',pushDiagnosticCode(attempt.classification)],
     ['HTTP 응답',attempt.response_status===null?'기록 없음':String(attempt.response_status)],['오류 코드',pushDiagnosticCode(attempt.error_code)],['오류 종류',pushDiagnosticCode(attempt.error_class)],
     ['재시도 지연',attempt.retry_delay_ms===null?'기록 없음':(attempt.retry_delay_ms/1000).toLocaleString('ko-KR')+'초'],['시도 완료',time(attempt.completed_at)],
     ['시도 ID',attempt.id],['대상 ID',attempt.target_id],
    ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {attempt.error_code?<p className="system-note">{pushDeliveryReason(attempt.error_code)}</p>:null}
   </details>):<p className="system-note">기록된 전송 시도가 없어요</p>}
  </>}
 </section>;
}

export function PushDeliveryDialog({recipient,onClose}:{recipient:PushRecipient;onClose:()=>void}){
 const loader=useCallback(()=>readPushDeliveryDetail(recipient.id),[recipient.id]),resource=useResource(loader),data=resource.data;
 const diagnosis=data?.recipient_diagnosis;
 const preference=(value:boolean|null)=>value===true?'ON':value===false?'OFF':'확인 불가';
 const recordedPreference=diagnosis?.notification_type==='LINEUP'?diagnosis.lineup_enabled:diagnosis?.notification_type==='COMMUNITY'?diagnosis.community_enabled:['MATCH','ATTENDANCE'].includes(diagnosis?.notification_type??'')?diagnosis?.match_enabled:null;
 const sameResult=data&&(['status','targets','succeeded','failed','pending','unknown','shadowed','suppressed'] as const).every(key=>data[key]===recipient[key]);
 const status=data?pushRecipientStatus({...recipient,...data,delivery_outcome:sameResult?recipient.delivery_outcome:undefined,last_error_code:data.last_error_code??(data.reasons.some(reason=>reason.code==='PUSH_EXPIRED')?'PUSH_EXPIRED':null)}):null;
 const noTarget=status?.label==='발송 대상 없음'||status?.label==='토큰 없음';
 const reasons=data?[...data.reasons,...(data.last_error_code&&!data.reasons.some(reason=>reason.code===data.last_error_code)?[{code:data.last_error_code,count:null}]:[])]:[];
 const noTargetDiagnosis=data&&noTarget?pushNoTargetDiagnosis(data):null;
 return <Dialog title="푸시 발송 상세" onClose={onClose} className="push-delivery-dialog">
  <div className="push-delivery-user"><span className="push-recipient-user"><TeamMark team={recipient.team??undefined}/><b>{recipient.nickname||'닉네임 없음'}</b></span>{status?<Badge tone={status.tone}>{status.label}</Badge>:null}</div>
  {resource.loading?<WorkspaceSkeleton/>:resource.error?<Empty error={resource.error} retry={resource.reload}/>:data&&status?<>
   {status.label!=='접수 성공'||reasons.length?<section className="push-delivery-reasons">
    <h3>{noTarget?'미발송 사유':status.label==='발송 제외'?'제외 사유':status.label==='발송 실패'?'실패 사유':'기록된 사유'}</h3>
    {noTargetDiagnosis?<div><p>{noTargetDiagnosis.summary}</p><p>{noTargetDiagnosis.unknown}</p>{diagnosis?<code>대상 확인 기록 · {pushDiagnosticCode(diagnosis.outcome)} · {time(diagnosis.captured_at)}</code>:<code>대상 확인 당시 진단 기록 없음</code>}<p className="push-next-check">확인할 항목 · {noTargetDiagnosis.nextCheck}</p></div>:null}
    {reasons.length?reasons.map(reason=><div key={reason.code}>
     <p><span>{pushDeliveryReason(reason.code)}</span>{reason.count!==null?<span> · {reason.count.toLocaleString('ko-KR')}개 기기</span>:null}</p>
     <code>{reason.count===null?'발송 처리 기록':'기기별 최종 기록'} · {pushDiagnosticCode(reason.code)}</code>
     <p className="push-next-check">확인할 항목 · {pushFailureNextCheck(reason.code)}</p>
    </div>):!noTarget?<p>{status.label==='발송 제외'?'구체적인 제외 사유가 기록되지 않았어요 알림 OFF 여부는 이 기록만으로 확인할 수 없어요':'구체적인 사유가 기록되지 않았어요'}</p>:null}
   </section>:null}
   <dl className="workspace-details">{[
    ['알림',recipient.title??'알림 원문 없음'],...(recipient.body!==null?[['알림 내용',recipient.body]]:[]),['현재 앱 알림 설정',data.current_preference===true?'ON':data.current_preference===false?'OFF':'확인 불가'],['대상 생성',time(data.created_at)],
    ...(diagnosis?[['대상 확인 시각',time(diagnosis.captured_at)],['대상 확인 단계',diagnosis.stage==='target_selection'?'기기 선정':'기기 선정 전 처리 종료'],['당시 앱 알림 설정',diagnosis.preference_exists?preference(recordedPreference??null):'설정 정보 없음'],
     ...(['GOAL','GOAL_CANCELLED'].includes(diagnosis.phase??'')?[['당시 득점 알림 설정',preference(diagnosis.goal_enabled)]]:[]),
     ['당시 등록 기기',diagnosis.registered_devices===null?'선정 전 종료로 미확인':diagnosis.registered_devices.toLocaleString('ko-KR')+'개'],
     ...(diagnosis.duplicate_devices?[['중복 제외 기기',diagnosis.duplicate_devices.toLocaleString('ko-KR')+'개']]:[])]:[]),
    ...(data.succeeded>0?[['최근 접수 성공',time(data.last_success_at)],['접수된 기기',data.succeeded.toLocaleString('ko-KR')+'개']]:[]),
    ...(recipient.expires_at?[['알림 유효 시각',time(recipient.expires_at)]]:[]),
    ['최근 발송 시도',time(data.last_attempted_at)],['처리 종료',time(data.completed_at)],['발송 시도',data.attempts.toLocaleString('ko-KR')+'회'],['대상 기기',data.targets.toLocaleString('ko-KR')+'개'],
    ...(data.unknown>0?[['결과 불명 기기',data.unknown.toLocaleString('ko-KR')+'개']]:[]),...(data.pending>0?[['처리 중인 기기',data.pending.toLocaleString('ko-KR')+'개']]:[]),
    ...(data.failed>0?[['실패한 기기',data.failed.toLocaleString('ko-KR')+'개']]:[]),...(data.suppressed>0?[['제외된 기기',data.suppressed.toLocaleString('ko-KR')+'개']]:[]),
   ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   <AttemptHistory data={data}/>
   <details className="push-trace"><summary>추적 정보</summary><dl className="workspace-details"><div><dt>발송 ID</dt><dd>{recipient.id}</dd></div><div><dt>처리 상태</dt><dd>{pushDiagnosticCode(data.status)}</dd></div></dl></details>
   <p className="push-preference-note">현재 앱 알림 설정은 조회 시점 기준이에요 · 발송 당시 설정과 휴대폰의 알림 권한은 이 값으로 확인할 수 없어요</p>
   {data.succeeded>0?<p className="system-note">접수 성공은 푸시 서버 수락 기준이에요 · 실제 기기 수신·읽음 여부는 수집하지 않아요</p>:null}
  </>:null}
 </Dialog>;
}

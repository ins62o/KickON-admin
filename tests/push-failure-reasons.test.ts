import test from 'node:test';
import assert from 'node:assert/strict';
import * as pushModel from '../src/management/push-model.ts';
import {pushFailureSummary,pushDeliveryReason,pushEvidenceTime,type PushRecipient} from '../src/management/push-model.ts';
const row:PushRecipient={id:'o',user_id:'u',nickname:null,team:null,title:null,body:null,created_at:'2026-10-24T05:00:00Z',last_attempted_at:null,last_error_code:null,status:'COMPLETED',attempts:0,targets:0,succeeded:0,failed:0,pending:0,unknown:0,shadowed:0,suppressed:0};
test('no-token explanation proves only missing registration and does not invent OFF or uninstall',()=>{
 const summary=pushFailureSummary({...row,delivery_outcome:'no_target'});
 assert.match(summary,/발송 대상 기기가 없/);assert.match(summary,/이유는 확인할 수 없/);assert.doesNotMatch(summary,/등록된.*0개/);
 assert.doesNotMatch(summary,/설정을 꺼|삭제했|권한을 거부/);
});
test('provider loss remains unknown and partial outcomes keep all recorded device reasons',()=>{
 assert.match(pushFailureSummary({...row,delivery_outcome:'unknown',last_error_code:'PROVIDER_RESPONSE_LOST'}),/접수 여부를 확인할 수 없/);
 const summary=pushFailureSummary({...row,delivery_outcome:'partial',targets:3,succeeded:1,failed:2,failure_reasons:[{code:'UNREGISTERED',count:1},{code:'AUTH_CONFIGURATION',count:1}]});
 assert.match(summary,/3개 중 1개/);assert.match(summary,/토큰이 더 이상 유효/);assert.match(summary,/인증 설정/);
});
test('expiry and absent/unrecognized evidence remain explicit rather than guessed',()=>{
 assert.match(pushFailureSummary({...row,delivery_outcome:'expired',failure_reasons:[{code:'PUSH_EXPIRED',count:2}]}),/유효 시간/);
 assert.match(pushFailureSummary({...row,delivery_outcome:'failure'}),/확인할 수 없/);
 assert.match(pushDeliveryReason('FUTURE_PROVIDER_REASON'),/확인할 수 없/);
});


test('evidence timestamps preserve seconds and use Korean time',()=>{assert.match(pushEvidenceTime('2026-10-24T05:00:09Z'),/14:00:09/);});

test('failure and non-send totals have truthful labels and retain their category filters',()=>{
 assert.equal(pushModel.pushDeliveryMetrics.find(metric=>metric.key==='failure')?.title,'오늘 실패·미발송');
 assert.deepEqual(pushModel.pushFailureReasons.map(reason=>reason.value),['all','failure','expired','unknown','no_target','partial','excluded']);
});
test('diagnosis proves zero registered devices only from the historical snapshot',()=>{
 const base={...row,current_preference:false,completed_at:null,last_success_at:null,reasons:[]};
 const diagnosed={...base,recipient_diagnosis:{version:1,captured_at:'2026-10-31T03:00:08Z',stage:'target_selection',notification_type:'ATTENDANCE',phase:null,preference_exists:true,match_enabled:true,goal_enabled:true,lineup_enabled:true,community_enabled:true,registered_devices:0,selected_devices:0,duplicate_devices:0,outcome:'NO_REGISTERED_DEVICE'}};
 const actual=pushModel.pushNoTargetDiagnosis(diagnosed);
 assert.match(actual.summary,/등록.*0개/);assert.match(actual.nextCheck,/등록 요청.*저장 결과/);assert.match(actual.unknown,/휴대폰.*권한/);
 assert.doesNotMatch(pushModel.pushNoTargetDiagnosis(base).summary,/등록.*0개/);
 assert.doesNotMatch(pushModel.pushNoTargetDiagnosis({...diagnosed,recipient_diagnosis:{...diagnosed.recipient_diagnosis,registered_devices:2,duplicate_devices:2}}).summary,/등록.*0개/);
});
test('provider status is evidence of a response and lost responses stay unknown',()=>{
 assert.equal(pushModel.pushAttemptStage({response_status:404,error_code:'UNREGISTERED'}),'공급자 응답');
 assert.equal(pushModel.pushAttemptStage({response_status:null,error_code:'SEND_AUTHORIZATION_DENIED'}),'발송 직전 대상 확인');
 assert.equal(pushModel.pushAttemptStage({response_status:null,error_code:'PROVIDER_RESPONSE_LOST'}),'공급자 접수 결과 미확인');
 assert.equal(pushModel.pushAttemptStage({response_status:null,error_code:null}),'단계 미기록');
});
test('diagnostic codes hide raw token-shaped values and credentials while retaining useful known errors',()=>{
 for(const value of ['UNREGISTERED','PROVIDER_RESPONSE_LOST','BadDeviceToken','FutureProviderReason','TypeError'])assert.equal(pushModel.pushDiagnosticCode(value),value);
 for(const value of ['Bearer secret','a'.repeat(64),'sbp_abcdefgh','eyJhbGci.abc.def','token=secret'])assert.equal(pushModel.pushDiagnosticCode(value),'민감할 수 있는 값 숨김');
});

test('dashboard breakdown separates the observed 19 non-sends from one delivery failure',()=>{
 const counts={today_failed:20,today_partial:0,today_expired:0,today_unknown:0,today_no_target:19,today_excluded:0};
 assert.deepEqual(pushModel.pushFailureBreakdown(counts),[{label:'발송 오류',count:1},{label:'토큰 없음',count:19}]);
 assert.equal(pushModel.pushFailureBreakdown({...counts,today_no_target:21}),null);
 assert.match(pushModel.pushFailureNextCheck('UNREGISTERED'),/새 푸시 토큰.*등록/);
 assert.match(pushModel.pushFailureNextCheck('PROVIDER_RESPONSE_LOST'),/접수 여부.*재발송/);
});

test('broad failure rows preserve successful device evidence in the list and detail status',()=>{
 const mixed:PushRecipient={...row,delivery_outcome:'failure',status:'COMPLETED',targets:2,succeeded:1,failed:1,attempts:2,last_error_code:'UNREGISTERED',failure_reasons:[{code:'UNREGISTERED',count:1}]};
 assert.equal(pushModel.pushRecipientStatus(mixed).label,'부분 성공');
 assert.match(pushFailureSummary(mixed),/2개 중 1개/);assert.match(pushFailureSummary(mixed),/토큰이 더 이상 유효/);
 assert.equal(pushModel.pushRecipientStatus({...mixed,succeeded:0,failed:2}).label,'발송 실패');
 assert.equal(pushModel.pushRecipientStatus({...mixed,failed:0,unknown:1,status:'UNKNOWN_OUTCOME'}).label,'결과 불명');
 assert.equal(pushModel.pushRecipientStatus({...mixed,failed:0,pending:1,status:'RETRY'}).label,'재시도 대기');
});

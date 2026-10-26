import test from 'node:test';
import assert from 'node:assert/strict';
import {pushFailureSummary,pushDeliveryReason,pushEvidenceTime,type PushRecipient} from '../src/management/push-model.ts';
const row:PushRecipient={id:'o',user_id:'u',nickname:null,team:null,title:null,body:null,created_at:'2026-10-24T05:00:00Z',last_attempted_at:null,last_error_code:null,status:'COMPLETED',attempts:0,targets:0,succeeded:0,failed:0,pending:0,unknown:0,shadowed:0,suppressed:0};
test('no-token explanation proves only missing registration and does not invent OFF or uninstall',()=>{
 const summary=pushFailureSummary({...row,delivery_outcome:'no_target'});
 assert.match(summary,/등록된 푸시 토큰이 0개/);assert.match(summary,/이유는 확인할 수 없/);
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

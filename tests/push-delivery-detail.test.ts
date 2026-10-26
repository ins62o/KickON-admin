import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readPushDeliveryDetail} from '../src/management/push-settings.ts';
import {pushDeliveryReason} from '../src/management/push-model.ts';
const id='00000000-0000-4000-8000-000000000001';
const detail={current_preference:true,status:'SUPPRESSED',created_at:'2026-10-20T05:00:00Z',completed_at:null,last_attempted_at:null,last_success_at:null,last_error_code:null,attempts:0,targets:1,succeeded:0,failed:0,pending:0,unknown:0,shadowed:0,suppressed:1,reasons:[{code:'PREFERENCE_DISABLED',count:1}]};
const client=(data:unknown,error:unknown=null)=>({rpc(name:string,args:unknown){assert.equal(name,'get_admin_push_delivery_detail');assert.deepEqual(args,{p_outbox_id:id});return {abortSignal:async()=>({data,error})};}} as unknown as SupabaseClient);
test('delivery detail reads the selected outbox and preserves absent reasons and timestamps',async()=>{
 assert.deepEqual(await readPushDeliveryDetail(client(detail),id),detail);
 assert.deepEqual((await readPushDeliveryDetail(client({...detail,reasons:[]}),id)).reasons,[]);
 for(const current_preference of [true,false,null])assert.equal((await readPushDeliveryDetail(client({...detail,current_preference}),id)).current_preference,current_preference);
});
test('delivery detail validates boundaries and does not turn failures into zero counts',async()=>{
 for(const data of [null,{}, {...detail,succeeded:2},{...detail,targets:-1},{...detail,current_preference:undefined},{...detail,current_preference:'OFF'},{...detail,last_success_at:'invalid'},{...detail,completed_at:undefined},{...detail,reasons:null},{...detail,reasons:[null]},{...detail,reasons:[{code:'',count:1}]},{...detail,reasons:[{code:'PUSH_EXPIRED',count:0}]}])await assert.rejects(readPushDeliveryDetail(client(data),id),/확인할 수 없어요/);
 await assert.rejects(readPushDeliveryDetail(client(detail,{message:'denied'}),id),/확인할 수 없어요/);
 await assert.rejects(readPushDeliveryDetail(client(detail),'invalid'),/확인할 수 없어요/);
});
test('reason descriptions distinguish preferences, expiry, denied sends and unknown codes',()=>{
 assert.match(pushDeliveryReason('PREFERENCE_DISABLED'),/설정/);assert.match(pushDeliveryReason('PUSH_EXPIRED'),/유효 시간/);assert.match(pushDeliveryReason('SEND_AUTHORIZATION_DENIED'),/대상 조건/);for(const code of ['NEW_CODE','__proto__','constructor'])assert.equal(pushDeliveryReason(code),'오류 코드는 기록됐지만 구체적인 사유는 확인할 수 없어요');
});
const diagnosis={version:1,captured_at:'2026-10-20T05:00:00Z',stage:'target_selection',notification_type:'MATCH',phase:'FULL_TIME',preference_exists:true,match_enabled:true,goal_enabled:false,lineup_enabled:true,community_enabled:true,registered_devices:0,selected_devices:0,duplicate_devices:0,outcome:'NO_REGISTERED_DEVICE'};
test('dispatch observations retain historical preferences, zero devices and early-closure unknowns',async()=>{
 for(const recipient_diagnosis of [null,diagnosis,{...diagnosis,registered_devices:2,selected_devices:1,duplicate_devices:1,outcome:'TARGETS_SELECTED'},{...diagnosis,stage:'closed_before_selection',registered_devices:null,selected_devices:null,duplicate_devices:null,outcome:'CLOSED_BEFORE_SELECTION'},{...diagnosis,preference_exists:false,match_enabled:null,goal_enabled:null,lineup_enabled:null,community_enabled:null}]){
  const value={...detail,current_preference:false,recipient_diagnosis};assert.deepEqual(await readPushDeliveryDetail(client(value),id),value);
 }
});
test('malformed dispatch observations fail visibly instead of inventing missing preferences or counts',async()=>{
 for(const recipient_diagnosis of [{},'snapshot',{...diagnosis,version:2},{...diagnosis,captured_at:'invalid'},{...diagnosis,match_enabled:undefined},{...diagnosis,registered_devices:-1},{...diagnosis,registered_devices:1},{...diagnosis,selected_devices:0.5},{...diagnosis,outcome:'TARGETS_SELECTED'},{...diagnosis,stage:'other'},{...diagnosis,stage:'closed_before_selection',outcome:'CLOSED_BEFORE_SELECTION'},{...diagnosis,preference_exists:false},{...diagnosis,phase:undefined}])await assert.rejects(readPushDeliveryDetail(client({...detail,recipient_diagnosis}),id),/확인할 수 없어요/);
});

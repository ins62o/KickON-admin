import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import * as notices from "../src/management/notice-actions.ts";
const original={id:"00000000-0000-4000-8000-000000000001",title:"기존 공지",content:"기존 공지 내용"};
function fixture(respond:(path:string,body:Record<string,unknown>)=>Response){
  return createClient("https://notices.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)).pathname,JSON.parse(String(init?.body??"{}")))}});
}
test("notice edits save through the audited RPC and include the original text to prevent overwriting another edit",async()=>{
  const client=fixture((path,body)=>{
    assert.equal(path,"/rest/v1/rpc/admin_update_community_notice");
    assert.deepEqual(body,{p_notice_id:original.id,p_title:"수정 공지",p_content:"수정한 공지 내용",p_expected_title:original.title,p_expected_content:original.content});
    return Response.json(original.id);
  });
  await notices.saveNotice(client,original," 수정 공지 "," 수정한 공지 내용 ");
});
test("invalid notice edits never send a write request",async()=>{
  const client=fixture(()=>{throw Error("must not write");});
  for(const [title,content] of [["","내용은 다섯 글자 이상"],["가","공지 내용"],["가".repeat(101),"공지 내용"],["제목","짧음"],["제목","가".repeat(10001)]]){
    await assert.rejects(notices.saveNotice(client,original,title,content),/제목|내용/);
  }
});
test("hiding and restoring notices do not require typed reasons but still record the actual action",async()=>{
  for(const hidden of [true,false]){
    const client=fixture((path,body)=>{
      assert.equal(path,"/rest/v1/rpc/admin_set_content_visibility");
      assert.deepEqual(body,{p_target_type:"POST",p_target_id:original.id,p_hidden:hidden,p_reason:hidden?"관리자 공지 숨김":"관리자 공지 다시 게시",p_content_report_id:null});
      return Response.json(true);
    });
    await notices.setNoticeVisibility(client,original.id,hidden);
  }
});
test("permission errors, stale edits, and missing backend setup remain actionable failures",async()=>{
  for(const [payload,expected] of [[{message:"ADMIN_PERMISSION_REQUIRED"},/권한/],[{message:"NOTICE_CONFLICT"},/다른 관리자/],[{message:"NOTICE_NOT_FOUND"},/찾을 수/],[{message:"function missing",code:"PGRST202"},/DB 설정/]] as const){
    await assert.rejects(notices.saveNotice(fixture(()=>Response.json(payload,{status:400})),original,"수정 제목","수정 공지 내용"),expected);
  }
});
test("missing acknowledgments cannot be presented as successful saves or visibility changes",async()=>{
  await assert.rejects(notices.saveNotice(fixture(()=>Response.json(null)),original,"수정 제목","수정 공지 내용"),/확인하지/);
  await assert.rejects(notices.setNoticeVisibility(fixture(()=>Response.json(false)),original.id,true),/확인하지/);
});

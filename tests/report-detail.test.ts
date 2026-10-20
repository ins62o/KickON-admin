import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {readReportDetail} from "../src/management/report-detail.ts";
const report={id:"report",reporter_user_id:"reporter-user",target_type:"POST",post_id:"post-content-id",reason:"HATE",details:"신고 내용",status:"RESOLVED",resolution_note:"처리 완료",created_at:"2026-10-01T12:15:00Z"};
function fixture(respond:(path:string,body:Record<string,unknown>)=>Response){return createClient("https://reports.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)).pathname,JSON.parse(String(init?.body??"{}")))}});}
test("report detail reads the selected admin report and shows reporter/author nicknames and their own team IDs for every target type",async()=>{
  for(const targetType of ["POST","COMMENT","FIXTURE_CHEER"]){
    const client=fixture((path,body)=>{assert.equal(path,"/rest/v1/rpc/admin_get_content_report");assert.deepEqual(body,{p_report_id:"report"});return Response.json({report:{...report,target_type:targetType},reporter:{userId:"reporter-user",nickname:"신고한 팬",teamId:"incheon"},author:{userId:"reported-user",nickname:"신고받은 팬",teamId:"seoul"},target:{id:"content-id",type:targetType}});});
    const detail=await readReportDetail(client,"report");
    assert.deepEqual(detail,{id:"report",createdAt:report.created_at,reason:"HATE",details:"신고 내용",status:"RESOLVED",resolutionNote:"처리 완료",targetType,reporterNickname:"신고한 팬",reportedNickname:"신고받은 팬",reporterTeamId:"incheon",reportedTeamId:"seoul"});
  }
});
test("missing nicknames stay unknown rather than displaying any user or content ID",async()=>{
  const detail=await readReportDetail(fixture(()=>Response.json({report,reporter:{userId:"reporter-user",nickname:" "},author:{userId:"reported-user"},target:{id:"content-id"}})),"report");
  assert.equal(detail.reporterNickname,null);assert.equal(detail.reportedNickname,null);assert.equal(detail.reporterTeamId,null);assert.equal(detail.reportedTeamId,null);
});
test("report lookup failures never become successful empty or unknown details",async()=>{
  for(const [message,expected] of [["MODERATION_PERMISSION_REQUIRED",/권한/],["CONTENT_REPORT_NOT_FOUND",/찾을 수/],["database unavailable",/불러오지/]] as const){
    await assert.rejects(readReportDetail(fixture(()=>Response.json({message},{status:400})),"report"),expected);
  }
});
test("mismatched, missing or incomplete admin report responses cannot reveal another record or invent a processing status",async()=>{
  for(const payload of [null,{}, {report:{...report,id:"another-report"}},{report:{...report,status:null}},{report:{...report,status:"unexpected"}}]){
    await assert.rejects(readReportDetail(fixture(()=>Response.json(payload)),"report"),/응답/);
  }
});
test("an empty report ID is rejected without issuing a request",async()=>{
  await assert.rejects(readReportDetail(fixture(()=>{throw Error("must not request");})," "),/조회할 신고/);
});

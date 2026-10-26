import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {readInquirySender} from "../src/management/inquiry-sender.ts";
function fixture(respond:(path:string,body:Record<string,unknown>)=>Response){return createClient("https://inquiries.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)).pathname,JSON.parse(String(init?.body??"{}")))}});}
test("inquiry sender comes from the selected authorized inquiry and retains only nickname and emblem fields",async()=>{
  const client=fixture((path,body)=>{assert.equal(path,"/rest/v1/rpc/admin_get_support_inquiry");assert.deepEqual(body,{p_inquiry_id:"inquiry"});return Response.json({id:"inquiry",userId:"private-user-id",content:"문의 내용",adminNotes:[{note:"내부 메모"}],author:{nickname:"응원하는 팬",teamId:"incheon",teamName:"인천 유나이티드"}});});
  assert.deepEqual(await readInquirySender(client,"inquiry"),{nickname:"응원하는 팬",team:{id:"incheon",name:"인천 유나이티드",code:""}});
});
test("missing nicknames and unselected teams are never replaced by a user ID or another club",async()=>{
  assert.deepEqual(await readInquirySender(fixture(()=>Response.json({id:"inquiry",userId:"private-user-id",author:{nickname:" ",teamId:null,teamName:null}})),"inquiry"),{nickname:null,team:null});
});
test("wrong inquiry responses and denied reads remain errors",async()=>{
  await assert.rejects(readInquirySender(fixture(()=>Response.json({id:"another-inquiry",author:{nickname:"다른 사용자"}})),"inquiry"),/응답/);
  await assert.rejects(readInquirySender(fixture(()=>Response.json({message:"SUPPORT_PERMISSION_REQUIRED"},{status:403})),"inquiry"),/권한/);
});
test("empty inquiry IDs do not issue requests",async()=>{
  await assert.rejects(readInquirySender(fixture(()=>{throw Error("must not request");})," "),/조회할 문의/);
});

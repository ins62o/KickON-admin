import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import * as activity from "../src/management/activity-list.ts";

function fixture(respond:(url:URL,body:Record<string,unknown>)=>Response){
  return createClient("https://activity.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)),JSON.parse(String(init?.body??"{}")))}});
}

test("community list uses the complete admin RPC with search, exact total and server pagination",async()=>{
  const client=fixture((url,body)=>{
    if(url.pathname==="/rest/v1/profiles"){
      assert.equal(url.searchParams.get("id"),"in.(user)");
      return Response.json([{id:"user",team:{id:"incheon",name:"인천 유나이티드",code:"INC"}}]);
    }
    assert.ok(url.pathname.endsWith("admin_get_community_posts"));
    assert.deepEqual(body,{p_query:"후기",p_offset:15,p_limit:15});
    return Response.json({total:16,records:[{id:"post",title:"경기 후기",content:"전체 본문",author_name:"팬",author_id:"user",team_name:"서울",board:"TEAM",moderation_status:"HIDDEN",created_at:"2026-10-18T01:00:00Z",comment_count:2,like_count:3}]});
  });
  const result=await activity.readActivityList(client,"community",2," 후기 ");
  assert.equal(result.total,16);
  assert.deepEqual(result.rows[0],{id:"post",userName:"팬",userId:"user",authorTeam:{id:"incheon",name:"인천 유나이티드",code:"INC"},teamName:"서울",title:"경기 후기",content:"전체 본문",createdAt:"2026-10-18T01:00:00Z",context:"서울",status:"HIDDEN",result:null});
});

test("attendance list includes every user's lifetime records without persisting location coordinates",async()=>{
  const client=fixture((url,body)=>{
    assert.ok(url.pathname.endsWith("admin_get_attendance_records"));
    assert.deepEqual(body,{p_query:"",p_offset:0,p_limit:15});
    return Response.json({total:2,records:[{id:"one",user_id:"a",user_name:"첫 팬",team_id:"seoul",team_name:"서울",result:"WIN",verified_at:"2026-10-18T00:00:00Z",latitude:37,longitude:127,stadium_name:"월드컵경기장",fixture:{home_team_name:"서울",away_team_name:"인천",attendance_latitude:37}},{id:"two",user_id:"b",user_name:"다른 팬",team_name:null,result:"unexpected",verified_at:"2025-01-01T00:00:00Z",fixture:null}]});
  });
  const result=await activity.readActivityList(client,"attendances",1,"");
  assert.equal(result.total,2);
  assert.deepEqual(result.rows[0].attendanceTeam,{id:"seoul",name:"서울",code:""});
  assert.equal(result.rows[1].attendanceTeam,null);
  assert.equal(result.rows[0].title,"서울 vs 인천");
  assert.equal(result.rows[0].context,"월드컵경기장");
  assert.equal(result.rows[0].result,"WIN");
  assert.equal(result.rows[1].userId,"b");
  assert.equal(result.rows[1].result,"UNKNOWN");
  assert.ok(!JSON.stringify(result).includes("latitude"));
});

test("activity errors never become a successful empty list",async()=>{
  for(const status of [403,503]){
    const client=fixture(()=>Response.json({message:status===403?"permission denied":"database unavailable"},{status}));
    await assert.rejects(activity.readActivityList(client,"community",1,""),status===403?/권한/:/불러오지/);
  }
});

test("incomplete activity responses cannot claim a total or an empty list",async()=>{
  for(const payload of [{records:[]},{total:0},{total:-1,records:[]},{total:null,records:[]}]){
    await assert.rejects(activity.readActivityList(fixture(()=>Response.json(payload)),"attendances",1,""),/응답/);
  }
});

test("invalid list pages are rejected before a request",async()=>{
  const client=fixture(()=>{throw new Error("must not request");});
  for(const page of [0,-1,1.5,Number.MAX_SAFE_INTEGER]){
    await assert.rejects(activity.readActivityList(client,"community",page,""),/페이지/);
  }
});


test("free-board authors keep their own team emblem while unselected teams remain empty",async()=>{
  const client=fixture(url=>url.pathname==="/rest/v1/profiles"?Response.json([{id:"fan",team:{id:"daegu",name:"대구 FC",code:"DGU"}},{id:"other",team:null}]):Response.json({total:2,records:[{id:"one",author_id:"fan",author_name:"팬",team_name:null,board:"LEAGUE",title:"자유 글",content:"",created_at:"2026-10-18T00:00:00Z"},{id:"two",author_id:"other",author_name:"다른 팬",team_name:"서울",board:"TEAM",title:"구단 글",content:"",created_at:"2026-10-18T00:00:00Z"}]}));
  const result=await activity.readActivityList(client,"community",1,"");
  assert.deepEqual(result.rows[0].authorTeam,{id:"daegu",name:"대구 FC",code:"DGU"});
  assert.equal(result.rows[0].context,"자유 게시판");
  assert.equal(result.rows[1].authorTeam,null);
});

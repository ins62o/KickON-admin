import test from "node:test";
import assert from "node:assert/strict";
import * as history from "../src/management/member-history.ts";
import {createClient} from "@supabase/supabase-js";

function fixture(respond:(url:URL,body:Record<string,unknown>)=>Response){
  return createClient("https://history.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)),JSON.parse(String(init?.body??"{}")))}});
}

test("post history queries only the selected author with stable pagination and an exact count",async()=>{
  assert.equal(typeof history.readMemberHistory,"function");
  const client=fixture((url)=>{
    if(url.pathname.endsWith("admin_has_capability"))return Response.json(true);
    assert.equal(url.pathname,"/rest/v1/posts");
    assert.equal(url.searchParams.get("author_id"),"eq.member-one");
    assert.equal(url.searchParams.get("order"),"created_at.desc,id.desc");
    assert.equal(url.searchParams.get("offset"),"15");
    assert.equal(url.searchParams.get("limit"),"15");
    return Response.json([{id:"post-2",author_id:"member-one",title:"경기 후기",content:"본문",created_at:"2026-10-18T00:00:00Z",moderation_status:"VISIBLE",board:"TEAM",team:{name:"FC 서울"}}],{headers:{"Content-Range":"15-15/16"}});
  });
  const result=await history.readMemberHistory(client,"member-one","posts",2);
  assert.equal(result.total,16);
  assert.equal(result.rows[0].title,"경기 후기");
  assert.equal(result.rows[0].content,"본문");
});

test("comment history is scoped to the selected user and keeps its parent post",async()=>{
  assert.equal(typeof history.readMemberHistory,"function");
  const client=fixture(url=>{
    if(url.pathname.endsWith("admin_has_capability"))return Response.json(true);
    assert.equal(url.pathname,"/rest/v1/comments");
    assert.equal(url.searchParams.get("user_id"),"eq.member-two");
    return Response.json([{id:"comment",user_id:"member-two",post_id:"post",content:"응원합니다",created_at:"2026-10-18T00:00:00Z",moderation_status:"VISIBLE",post:{title:"경기 안내"}}],{headers:{"Content-Range":"0-0/1"}});
  });
  const result=await history.readMemberHistory(client,"member-two","comments",1);
  assert.equal(result.rows[0].context,"경기 안내");
  assert.equal(result.rows[0].content,"응원합니다");
});

test("denied history never falls through to a partial public table view",async()=>{
  assert.equal(typeof history.readMemberHistory,"function");
  const client=fixture(url=>{assert.ok(url.pathname.endsWith("admin_has_capability"));return Response.json(false);});
  await assert.rejects(history.readMemberHistory(client,"member","posts",1),/권한/);
});

test("attendance history excludes other users and reads every matching page before counting",async()=>{
  assert.equal(typeof history.readMemberHistory,"function");
  const client=fixture((url,body)=>{
    assert.ok(url.pathname.endsWith("admin_get_attendance_records"));
    assert.equal(body.p_query,"member");
    const rows=body.p_offset===0?Array.from({length:100},(_,i)=>({id:String(i),user_id:i===0?"other":"member",verified_at:"2026-10-18T00:00:00Z",stadium_name:"경기장",fixture:{home_team_name:"서울",away_team_name:"인천"}})):[{id:"last",user_id:"member",verified_at:"2026-10-17T00:00:00Z",stadium_name:"경기장",fixture:null}];
    return Response.json({records:rows,total:101});
  });
  const result=await history.readMemberHistory(client,"member","attendances",7);
  assert.equal(result.total,100);
  assert.equal(result.rows.length,10);
  assert.equal(result.rows.at(-1)?.id,"last");
});

test("history failures stay errors and cannot appear as an empty activity list",async()=>{
  assert.equal(typeof history.readMemberHistory,"function");
  const client=fixture(url=>url.pathname.endsWith("admin_has_capability")?Response.json(true):Response.json({message:"database unavailable"},{status:503}));
  await assert.rejects(history.readMemberHistory(client,"member","posts",1));
});

test("attendance outcomes preserve the recorded supporter result without guessing from scores or the current team",async()=>{
  const results=["WIN","DRAW","LOSS","PENDING","invalid",null];
  const client=fixture(()=>Response.json({total:6,records:results.map((result,index)=>({id:String(index),user_id:"member",team_id:"original-team",result,verified_at:`2026-10-${18-index}T00:00:00Z`,stadium_name:"경기장",fixture:{home_team_name:"서울",away_team_name:"인천",home_score:4,away_score:0,status:"LIVE"}}))}));
  const page=await history.readMemberHistory(client,"member","attendances",1);
  assert.deepEqual(page.rows.map(row=>row.result),["WIN","DRAW","LOSS","PENDING","UNKNOWN","UNKNOWN"]);
});

test("attendance win rate counts all completed records, not just the visible page",async()=>{
  const client=fixture(()=>Response.json({total:20,records:Array.from({length:20},(_,index)=>({id:String(index),user_id:"member",result:index<15?"LOSS":"WIN",verified_at:`2026-10-${String(25-index).padStart(2,"0")}T00:00:00Z`,stadium_name:null,fixture:null}))}));
  const page=await history.readMemberHistory(client,"member","attendances",2);
  assert.equal(page.rows.length,5);
  assert.ok(page.rows.every(row=>row.result==="WIN"));
  assert.deepEqual(page.attendanceSummary,{wins:5,draws:0,losses:15,winRate:25});
});

test("attendance win rate includes draws and excludes pending or unknown results",async()=>{
  const results=["WIN","WIN","DRAW","LOSS","LOSS","PENDING",null];
  const client=fixture(()=>Response.json({total:7,records:results.map((result,index)=>({id:String(index),user_id:"member",result,verified_at:"2026-10-18T00:00:00Z",stadium_name:null,fixture:null}))}));
  const page=await history.readMemberHistory(client,"member","attendances",1);
  assert.deepEqual(page.attendanceSummary,{wins:2,draws:1,losses:2,winRate:40});
});

test("unsettled attendance cannot become a zero percent win rate",async()=>{
  const client=fixture(()=>Response.json({total:1,records:[{id:"pending",user_id:"member",result:"PENDING",verified_at:"2026-10-18T00:00:00Z",stadium_name:null,fixture:null}]}));
  const page=await history.readMemberHistory(client,"member","attendances",1);
  assert.deepEqual(page.attendanceSummary,{wins:0,draws:0,losses:0,winRate:null});
});

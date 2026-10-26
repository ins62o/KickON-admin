import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import * as detail from "../src/management/attendance-detail.ts";
function fixture(respond:(body:Record<string,unknown>)=>Response){
  return createClient("https://attendance.example.test","public-test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    assert.ok(String(input).endsWith("/rpc/admin_get_attendance_records"));
    return respond(JSON.parse(String(init?.body??"{}")));
  }}});
}
const record={id:"attendance-one",user_id:"fan",user_name:"팬",team_id:"seoul",team_name:"FC 서울",verified_at:"2026-10-18T09:24:00Z",verification_type:"GPS",result:"DRAW",latitude:37.56,longitude:126.89,distance_from_stadium:108,fixture_id:"fixture-one",stadium_id:"seoul-world-cup-stadium",stadium_name:"서울월드컵경기장",stadium_address:"서울 마포구",fixture:{home_team_name:"FC 서울",away_team_name:"김천 상무",kickoff_at:"2026-10-18T07:30:00Z",status:"FINISHED",home_score:2,away_score:2,league_id:"kleague",round:32,attendance_latitude:null,attendance_longitude:null,attendance_radius_meters:300}};

test("attendance details request the exact selected record and preserve authentication and match fields",async()=>{
  const client=fixture(body=>{assert.deepEqual(body,{p_attendance_id:"attendance-one",p_offset:0,p_limit:1});return Response.json({total:1,records:[record]});});
  const result=await detail.readAttendanceDetail(client,"attendance-one");
  assert.equal(result.id,"attendance-one");
  assert.equal(result.userId,"fan");
  assert.equal(result.team?.id,"seoul");
  assert.equal(result.verificationType,"GPS");
  assert.deepEqual(result.coordinates,{latitude:37.56,longitude:126.89});
  assert.equal(result.distance,108);
  assert.equal(result.fixture?.home_score,2);
  assert.equal(result.fixture?.attendance_radius_meters,300);
  assert.equal(result.stadiumAddress,"서울 마포구");
});

test("pending results stay pending and missing scores never become zero or a settled result",async()=>{
  const result=await detail.readAttendanceDetail(fixture(()=>Response.json({total:1,records:[{...record,result:"PENDING",latitude:0,longitude:0,distance_from_stadium:0,fixture:{...record.fixture,status:"SCHEDULED",home_score:null,away_score:null}}]})),"attendance-one");
  assert.equal(result.result,"PENDING");
  assert.equal(result.fixture?.home_score,null);
  assert.deepEqual(result.coordinates,{latitude:0,longitude:0});
  assert.equal(result.distance,0);
});

test("missing fixture and unknown result remain unknown",async()=>{
  const result=await detail.readAttendanceDetail(fixture(()=>Response.json({total:1,records:[{...record,result:null,fixture:null,team_id:null,team_name:null}]})),"attendance-one");
  assert.equal(result.fixture,null);
  assert.equal(result.team,null);
  assert.equal(result.result,"UNKNOWN");
});

test("missing or mismatched detail records and failed requests remain errors",async()=>{
  for(const payload of [{total:0,records:[]},{total:1,records:[{...record,id:"another-attendance"}]},{total:1}]){
    await assert.rejects(detail.readAttendanceDetail(fixture(()=>Response.json(payload)),"attendance-one"));
  }
  await assert.rejects(detail.readAttendanceDetail(fixture(()=>Response.json({message:"permission denied"},{status:403})),"attendance-one"),/권한/);
});

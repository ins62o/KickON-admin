import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialStatsReconciler,matchOfficialRecords,openKoreanSession,parseOfficialRecords,OFFICIAL_LANGUAGE_URL,OFFICIAL_PAGE_URL,OFFICIAL_RECORD_URL,type SquadPlayer} from '../supabase/functions/_shared/official-player-stats.ts';

const config={url:'https://project.supabase.co',serviceKey:'service-secret',cronSecret:'cron-secret'};
const request=(secret=config.cronSecret,body:unknown={apply:true})=>new Request(`${config.url}/functions/v1/reconcile-official-player-stats`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:JSON.stringify(body)});
const squad:SquadPlayer[]=[
 {league_id:'kleague',team_id:'anyang',player_id:'320896',name_ko:'이태희',shirt_number:32},
 {league_id:'kleague',team_id:'anyang',player_id:'111',name_ko:'김민준',shirt_number:7},
 {league_id:'kleague',team_id:'anyang',player_id:'112',name_ko:'김민준',shirt_number:17},
 {league_id:'kleague2',team_id:'suwon-bluewings',player_id:'786778',name_ko:'루이스',shirt_number:70},
];
const official=(list:unknown[])=>({resultCode:'200',data:{list}});

test('official records parse only well-formed rows and reject other shapes',()=>{
 const rows=parseOfficialRecords(official([{name:' 이태희 ',gameQty:18,goalQty:'1',backNo:32,playerId:'20150080'},{name:'',gameQty:1,goalQty:0},{name:'x',gameQty:-1,goalQty:0}]));
 assert.deepEqual(rows,[{name:'이태희',backNo:32,gameQty:18,goalQty:1,officialId:'20150080'}]);
 assert.throws(()=>parseOfficialRecords({resultCode:'500'}));
 assert.throws(()=>parseOfficialRecords(null));
});

test('matching uses club and Korean name, narrows by shirt number and drops anything ambiguous',()=>{
 const records=parseOfficialRecords(official([
  {name:'이태희',gameQty:18,goalQty:1,backNo:32},
  {name:'김민준',gameQty:5,goalQty:0,backNo:17},
  {name:'김민준',gameQty:3,goalQty:0,backNo:null},
  {name:'루이스',gameQty:9,goalQty:7,backNo:70},
  {name:'없는선수',gameQty:1,goalQty:0,backNo:1},
 ]));
 const result=matchOfficialRecords('anyang',records,squad);
 assert.deepEqual(result.rows.map(row=>[row.player_id,row.appearances,row.goals]),[['320896',18,1],['112',5,0]]);
 assert.equal(result.ambiguous,1);
 assert.equal(result.unmatched,2);
});

test('two official rows that resolve to one app player are both dropped',()=>{
 const records=parseOfficialRecords(official([{name:'이태희',gameQty:18,goalQty:1,backNo:32},{name:'이 태희',gameQty:2,goalQty:0,backNo:32},{name:'이태희',gameQty:4,goalQty:0,backNo:32}]));
 const result=matchOfficialRecords('anyang',records,squad);
 assert.equal(result.rows.length,0);assert.equal(result.ambiguous,2);
});

test('the reconciler rejects callers without the cron secret before any read',async()=>{
 let calls=0;const handler=createOfficialStatsReconciler(config,async()=>{calls++;throw Error('must not call');});
 assert.equal((await handler(request('user-jwt'))).status,401);
 assert.equal((await handler(new Request(config.url))).status,405);
 assert.equal((await createOfficialStatsReconciler({...config,cronSecret:''})(request(''))).status,401);
 assert.equal(calls,0);
});

// The site flips its session language on each changeLang call; this fake starts in English like a request from abroad.
const site=(startLang='en')=>{let lang=startLang;return async(url:string,init?:RequestInit)=>{
 if(url===OFFICIAL_PAGE_URL)return new Response('<html></html>',{headers:{'Set-Cookie':'JSESSIONID=abc; Path=/'}});
 if(url===OFFICIAL_LANGUAGE_URL){assert.equal(new Headers(init?.headers).get('Cookie'),'JSESSIONID=abc');lang=lang==='en'?'ko':'en';return Response.json({resultCode:'200',data:{lang}});}
 return null;
};};

test('the official session is switched to Korean before any record is read',async()=>{
 const english=site('en'),korean=site('ko');
 const calls:string[]=[];
 const viaEnglish=await openKoreanSession((async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(String(input));return (await english(String(input),init))!;}) as typeof fetch);
 assert.equal(viaEnglish,'JSESSIONID=abc');assert.deepEqual(calls,[OFFICIAL_PAGE_URL,OFFICIAL_LANGUAGE_URL]);
 calls.length=0;
 await openKoreanSession((async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push(String(input));return (await korean(String(input),init))!;}) as typeof fetch);
 assert.deepEqual(calls,[OFFICIAL_PAGE_URL,OFFICIAL_LANGUAGE_URL,OFFICIAL_LANGUAGE_URL]);
 await assert.rejects(openKoreanSession((async(input:RequestInfo|URL)=>String(input)===OFFICIAL_PAGE_URL?new Response(''):Response.json({resultCode:'200',data:{lang:'en'}})) as typeof fetch),/OFFICIAL_LANGUAGE_NOT_KOREAN/);
});

test('a full read is applied once and a failed club read applies nothing',async()=>{
 const now=()=>Date.parse('2026-11-22T20:00:00Z');
 const applied:unknown[]=[];
 const fetcher=(failTeam?:string,englishTeam?:string)=>{const session=site();return async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  const sessionResponse=await session(url,init);if(sessionResponse)return sessionResponse;
  if(url.endsWith('/rpc/admin_official_stats_context')){assert.deepEqual(JSON.parse(String(init?.body)),{p_season:2026});return Response.json({players:squad});}
  if(url.endsWith('/rpc/admin_apply_official_player_stats')){applied.push(JSON.parse(String(init?.body)));return Response.json({released:1});}
  assert.equal(url,OFFICIAL_RECORD_URL);assert.equal(new Headers(init?.headers).get('Cookie'),'JSESSIONID=abc');
  const body=JSON.parse(String(init?.body));
  if(body.teamId===failTeam)return new Response('down',{status:500});
  if(body.teamId===englishTeam)return Response.json(official([{name:'Luis',gameQty:9,goalQty:7}]));
  return Response.json(official(body.teamId==='K27'?[{name:'이태희',gameQty:18,goalQty:1,backNo:32}]:[{name:'루이스',gameQty:9,goalQty:7,backNo:70}]));
 };};
 const ok=await createOfficialStatsReconciler(config,fetcher(),now)(request());
 assert.equal(ok.status,200);
 const call=applied.pop() as {p_rows:{player_id:string}[];p_apply:boolean;p_error:null};
 assert.equal(call.p_apply,true);assert.equal(call.p_error,null);
 assert.deepEqual(call.p_rows.map(row=>row.player_id).sort(),['320896','786778']);
 const report=await createOfficialStatsReconciler(config,fetcher(),now)(request(config.cronSecret,{apply:false}));
 assert.equal(report.status,200);assert.equal((applied.pop() as {p_apply:boolean}).p_apply,false);
 const failed=await createOfficialStatsReconciler(config,fetcher('K02'),now)(request());
 assert.equal(failed.status,502);
 const failure=applied.pop() as {p_rows:unknown[];p_apply:boolean;p_error:string};
 assert.deepEqual(failure.p_rows,[]);assert.equal(failure.p_apply,false);assert.equal(failure.p_error,'OFFICIAL_HTTP_500');
 const english=await createOfficialStatsReconciler(config,fetcher(undefined,'K02'),now)(request());
 assert.equal(english.status,502);assert.equal((applied.pop() as {p_error:string}).p_error,'OFFICIAL_NOT_KOREAN');
});

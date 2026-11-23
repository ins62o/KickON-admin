import test from "node:test";
import assert from "node:assert/strict";
import { parseSummary, parseMetrics, parseTrend, visibleDays, activityRate, syncStatus, groupSyncRows } from "../src/dashboard/data.ts";

test("missing and invalid counts stay unknown while real zero is preserved", () => {
  assert.deepEqual(parseSummary({totalProfiles:0,syncAvailable:true,failedSyncCount:0}), {totalProfiles:0,failedSyncCount:0});
  assert.deepEqual(parseSummary({totalProfiles:-1,syncAvailable:false,failedSyncCount:3}), {totalProfiles:null,failedSyncCount:null});
  assert.deepEqual(parseSummary({totalProfiles:"12",syncAvailable:true,failedSyncCount:null}), {totalProfiles:null,failedSyncCount:null});
});

test("trend excludes invalid days and untracked dates, without inventing missing days", () => {
  const trend = parseTrend({today:"2026-10-18",trackingStartedOn:"2026-10-15",daily:[
    {date:"2026-10-16",dau:3,mau:8},{date:"2026-10-14",dau:0,mau:0},
    {date:"2026-10-15",dau:0,mau:4},{date:"2026-02-30",dau:3,mau:5},
    {date:"2026-10-17",dau:"9",mau:10},{date:"2026-10-18",dau:6,mau:12}
  ]});
  assert.deepEqual(visibleDays(trend,7).map(day=>day.date), ["2026-10-15","2026-10-16","2026-10-18"]);
  assert.deepEqual(visibleDays(trend,2).map(day=>day.date), ["2026-10-18"]);
  assert.deepEqual(visibleDays(parseTrend({today:"2026-10-18",trackingStartedOn:null,daily:[{date:"2026-10-18",dau:0,mau:0}]}),7), []);
});

test("activity rate never reports missing, impossible, or empty populations as success", () => {
  assert.equal(activityRate(7,10),70);
  assert.equal(activityRate(0,10),0);
  for (const pair of [[null,10],[0,0],[12,10],[2,null]] as const) assert.equal(activityRate(...pair),null);
});

test("recorded sync results never call completed daily or one-time jobs delayed", () => {
  assert.equal(syncStatus({last_succeeded_at:null,last_error:null}),"unknown");
  assert.equal(syncStatus({last_succeeded_at:"2026-10-18T11:50:00Z",last_error:"failed"}),"error");
  assert.equal(syncStatus({last_succeeded_at:"2026-10-18T10:00:00Z",last_error:null}),"normal");
  assert.equal(syncStatus({last_succeeded_at:"2026-10-18T11:50:00Z",last_error:null}),"normal");
  assert.equal(syncStatus({last_succeeded_at:"2026-09-01T00:00:00Z",last_error:null}),"normal");
});


test("dashboard metrics preserve zero and reject missing or invalid counts independently", () => {
  assert.deepEqual(parseMetrics({posts:12,attendances:0,openInquiries:3}), {posts:12,attendances:0,openInquiries:3});
  assert.deepEqual(parseMetrics({posts:-1,attendances:4,openInquiries:"2"}), {posts:null,attendances:4,openInquiries:null});
  assert.deepEqual(parseMetrics({posts:1.5,attendances:Number.MAX_SAFE_INTEGER + 1,openInquiries:false}), {posts:null,attendances:null,openInquiries:null});
  assert.deepEqual(parseMetrics(null), {posts:null,attendances:null,openInquiries:null});
});

test('provider quota is entity-scoped and expired observations stay unknown', async () => {
  const data = await import('../src/dashboard/data.ts');
  assert.equal(typeof data.parseProviderUsage, 'function');
  const now=Date.parse('2026-10-18T03:00:00Z');
  const rows=[{observed_at:'2026-10-18T02:59:00Z',requested_entity:'Fixture',remaining:1984,resets_in_seconds:600},{observed_at:'2026-10-18T02:59:30Z',requested_entity:'Team',remaining:100,resets_in_seconds:600}];
  const quota=data.parseProviderUsage(rows,2000,now);
  assert.equal(quota.remaining,1984); assert.equal(quota.used,16); assert.equal(quota.rate,0.8);
  assert.equal(data.parseProviderUsage(rows,2000,now+600_000).remaining,null);
  assert.equal(data.parseProviderUsage(rows,1000,now).rate,null);
  assert.equal(data.parseProviderUsage([],2000,now).used,null);
});

test('live provider measurements use the authenticated server and preserve measured zero', async () => {
  const {readProviderUsage}=await import('../src/dashboard/data.ts');
  const client={auth:{getSession:async()=>({data:{session:{access_token:'admin-session'}},error:null})},rpc:()=>{throw Error('fresh live values should not need historical records');}};
  const result=await readProviderUsage(client as never,2000,'production',async(url,init)=>{
    assert.equal(url,'/api/admin/provider-usage');
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer admin-session');
    assert.deepEqual(JSON.parse(String(init?.body)),{environment:'production'});
    return Response.json({observation:{observed_at:new Date().toISOString(),requested_entity:'Fixture',remaining:0,resets_in_seconds:60}});
  });
  assert.equal(result.provider.remaining,0);assert.equal(result.provider.used,2000);assert.equal(result.provider.rate,100);assert.equal(result.failed,false);
});

test('unavailable live reads fall back to actual observations without inventing a reset', async () => {
  const {readProviderUsage}=await import('../src/dashboard/data.ts');
  let recordedAt=new Date().toISOString();
  const query={eq(){return this;},order(){return this;},async limit(){return {data:[{observed_at:recordedAt,requested_entity:'Fixture',remaining:1991,resets_in_seconds:60}],error:null};}};
  const client={auth:{getSession:async()=>({data:{session:{access_token:'admin-session'}},error:null})},rpc:()=>query};
  const fail=async()=>Response.json({error:'unavailable'},{status:503});
  assert.equal((await readProviderUsage(client as never,2000,'development',fail)).provider.used,9);
  recordedAt=new Date(Date.now()-120000).toISOString();
  const expired=await readProviderUsage(client as never,2000,'development',fail);
  assert.equal(expired.provider.remaining,null);assert.equal(expired.provider.rate,null);
});

test('missing provider configuration is surfaced after recorded quota expires but fresh records remain usable',async()=>{
  const {readProviderUsage}=await import('../src/dashboard/data.ts');
  let recordedAt=new Date(Date.now()-120000).toISOString();
  const query={eq(){return this;},order(){return this;},async limit(){return {data:[{observed_at:recordedAt,requested_entity:'Fixture',remaining:1990,resets_in_seconds:60}],error:null};}};
  const client={auth:{getSession:async()=>({data:{session:{access_token:'admin-session'}},error:null})},rpc:()=>query};
  const unconfigured=async()=>Response.json({code:'PROVIDER_USAGE_NOT_CONFIGURED',error:'설정 필요'},{status:503});
  const expired=await readProviderUsage(client as never,2000,'production',unconfigured);
  assert.equal(expired.provider.rate,null);
  assert.equal(expired.provider.unavailableReason,'not_configured');
  recordedAt=new Date().toISOString();
  const fresh=await readProviderUsage(client as never,2000,'production',unconfigured);
  assert.equal(fresh.provider.used,10);
  assert.equal(fresh.provider.unavailableReason,undefined);
});

test('recorded usage is read first and only a record older than a minute needs a live check',async()=>{
  const {readRecordedProviderUsage,recordedUsageIsFresh}=await import('../src/dashboard/data.ts');
  const now=Date.parse('2026-11-22T03:00:00Z');
  let observedAt=new Date(now-20_000).toISOString();
  const query={eq(){return this;},order(){return this;},async limit(){return {data:[{observed_at:observedAt,requested_entity:'Fixture',remaining:1990,resets_in_seconds:600}],error:null};}};
  const client={rpc:()=>query};
  const fresh=await readRecordedProviderUsage(client as never,2000,now);
  assert.equal(fresh.provider.used,10);assert.equal(fresh.observedAt,observedAt);assert.equal(recordedUsageIsFresh(fresh.observedAt,now),true);
  observedAt=new Date(now-90_000).toISOString();
  const stale=await readRecordedProviderUsage(client as never,2000,now);
  assert.equal(stale.provider.used,10);assert.equal(recordedUsageIsFresh(stale.observedAt,now),false);
  observedAt=new Date(now-700_000).toISOString();
  const expired=await readRecordedProviderUsage(client as never,2000,now);
  assert.equal(expired.provider.remaining,null);assert.equal(expired.observedAt,null);assert.equal(recordedUsageIsFresh(expired.observedAt,now),false);
  assert.equal(recordedUsageIsFresh(null,now),false);assert.equal(recordedUsageIsFresh(new Date(now+5_000).toISOString(),now),false);
  const failed=await readRecordedProviderUsage({rpc:()=>{throw Error('offline');}} as never,2000,now);
  assert.equal(failed.failed,true);assert.equal(failed.observedAt,null);
});

test('a failed live check reuses the record already read instead of querying it again',async()=>{
  const {readProviderUsage,parseProviderUsage}=await import('../src/dashboard/data.ts');
  const client={auth:{getSession:async()=>({data:{session:{access_token:'admin-session'}},error:null})},rpc:()=>{throw Error('the record was already read');}};
  const provider=parseProviderUsage([{observed_at:new Date().toISOString(),requested_entity:'Fixture',remaining:1980,resets_in_seconds:600}],2000);
  const result=await readProviderUsage(client as never,2000,'production',async()=>Response.json({error:'unavailable'},{status:503}),{provider,failed:false,observedAt:new Date().toISOString()});
  assert.equal(result.provider.used,20);assert.equal(result.failed,false);
});

test('the dashboard can skip the slow provider check so its own cards render first',async()=>{
  const {readDashboard}=await import('../src/dashboard/data.ts');
  const calls:string[]=[];
  const rows={select(){return this;},order(){return this;},limit(){return this;},then(resolve:(value:unknown)=>void){resolve({data:[],error:null});}};
  const client={
    auth:{getSession:async()=>{calls.push('provider-session');return {data:{session:null},error:null};}},
    rpc:async(name:string)=>{calls.push(name);if(name==='get_admin_provider_usage')throw Error('provider must not be read');return {data:null,error:{message:'unavailable'}};},
    from:()=>rows,
  };
  const result=await readDashboard(client as never,2000,'production',{provider:false});
  assert.equal(calls.includes('provider-session'),false);
  assert.equal(calls.includes('get_admin_provider_usage'),false);
  assert.equal(result.errors.provider,false);
  assert.equal(result.provider.rate,null);
  assert.equal(result.syncComplete,false);
  assert.deepEqual(calls.sort(),['admin_get_active_user_trend','admin_get_dashboard_metrics','admin_get_dashboard_summary']);
});

test("recent sync lists each task once with its scope count, newest success and worst status",()=>{
  const row=(sync_key:string,last_succeeded_at:string|null,last_error:string|null=null,last_attempted_at:string|null=last_succeeded_at)=>({sync_key,last_attempted_at,last_succeeded_at,last_error});
  const rows=[
    row("live:kleague","2026-11-23T11:56:00Z"),
    row("team-metrics:kleague","2026-11-22T19:40:00Z"),
    row("team-metrics:kleague2","2026-11-22T19:41:00Z"),
    row("squad:kleague:seoul","2026-11-22T19:10:00Z"),
    row("squad:kleague:ulsan","2026-11-21T19:10:00Z","provider timeout","2026-11-22T19:10:00Z"),
    row("squad:kleague2:suwon",null,null,"2026-11-22T19:09:00Z"),
  ];
  const groups=groupSyncRows(rows,true);
  assert.deepEqual(groups.map(({task,count,status,lastSucceededAt,row})=>[task,count,status,lastSucceededAt,row.sync_key]),[
    ["실시간 경기",1,"normal","2026-11-23T11:56:00Z","live:kleague"],
    ["구단 시즌 통계",2,"normal","2026-11-22T19:41:00Z","team-metrics:kleague"],
    ["구단 선수단",3,"error","2026-11-22T19:10:00Z","squad:kleague:ulsan"],
  ]);
  assert.equal(groupSyncRows(Array.from({length:9},(_,index)=>row(`custom-${index}`,null)),true,6).length,6);
  assert.deepEqual(groupSyncRows(rows,false).map(group=>group.count),[null,null,null],"a partial read never shows an undercounted scope total");
});

test("the dashboard counts scopes only when it read every sync state row",async()=>{
  const {readDashboard}=await import('../src/dashboard/data.ts');
  const read=async(count:number|null)=>{
    const options:unknown[]=[];
    const rows={select(_columns:string,option:unknown){options.push(option);return this;},order(){return this;},limit(){return this;},then(resolve:(value:unknown)=>void){resolve({data:[{sync_key:'squad:kleague:seoul',last_attempted_at:null,last_succeeded_at:null,last_error:null}],error:null,count});}};
    const client={rpc:async()=>({data:null,error:{message:'unavailable'}}),from:()=>rows};
    const result=await readDashboard(client as never,2000,'production',{provider:false});
    assert.deepEqual(options,[{count:'exact'}]);
    return result.syncComplete;
  };
  assert.equal(await read(1),true);
  assert.equal(await read(2),false);
  assert.equal(await read(null),false);
});

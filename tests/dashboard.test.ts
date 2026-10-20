import test from "node:test";
import assert from "node:assert/strict";
import { parseSummary, parseMetrics, parseTrend, visibleDays, activityRate, syncStatus } from "../src/dashboard/data.ts";

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

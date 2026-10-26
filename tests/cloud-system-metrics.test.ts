import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonitoringCollector} from '../supabase/functions/_shared/monitoring-collector.ts';
import {advanceMetricsWindow} from '../supabase/functions/_shared/system-metrics.ts';
import {createCloudSystemMetricsMonitor} from '../server/cloud-system-metrics.ts';
import type {SystemSample} from '../src/management/system-health.ts';
import type {SystemHistoryStore} from '../server/system-history.ts';
const config={url:'https://project.supabase.co',serviceKey:'service-secret',metricsKey:'metrics-secret',cronSecret:'cron-secret'};
const at=Date.parse('2026-10-20T00:00:00Z');
const scrape=(idle=80,user=20)=>`node_cpu_seconds_total{cpu="0",mode="idle"} ${idle}\nnode_cpu_seconds_total{cpu="0",mode="user"} ${user}\nnode_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 400\npg_up 1`;
const sample=(offset=0,cpu:number|null=0):SystemSample=>({observedAt:new Date(at+offset).toISOString(),cpu,status:'healthy',memory:{used:600,total:1000,rate:60},disk:null,connections:null,databaseBytes:null,bootAt:null});
const request=(secret=config.cronSecret)=>new Request(`${config.url}/functions/v1/collect-admin-resources`,{method:'POST',headers:{Authorization:`Bearer ${secret}`}});

test('scheduled collector rejects unauthorized and non-POST callers before any metric or database access',async()=>{
 let calls=0;const handler=createMonitoringCollector(config,async()=>{calls++;throw Error('must not call');});
 assert.equal((await handler(request('user-jwt'))).status,401);
 assert.equal((await handler(new Request(config.url))).status,405);
 assert.equal((await createMonitoringCollector({...config,cronSecret:''})(request(''))).status,401);
 assert.equal(calls,0);
});
test('scheduled collection restores the five-minute baseline across invocations and stores only measured data',async()=>{
 const context=advanceMetricsWindow(scrape(),at,[]);let stored:Record<string,unknown>|undefined;
 const handler=createMonitoringCollector(config,async(input,init)=>{
  const url=String(input),headers=new Headers(init?.headers);
  if(url.endsWith('/admin_resource_collection_context')){assert.equal(headers.get('apikey'),config.serviceKey);return Response.json(context);}
  if(url.endsWith('/admin_file_storage_size'))return Response.json({bytes:42939158});
  if(url.endsWith('/privileged/metrics')){assert.equal(headers.get('Authorization'),`Basic ${btoa(`service_role:${config.metricsKey}`)}`);return new Response(scrape(125,35));}
  assert.ok(url.endsWith('/admin_record_resource_sample'));stored=JSON.parse(String(init?.body));return new Response(null,{status:204});
 },()=>at+60000);
 const response=await handler(request());assert.equal(response.status,200);assert.equal((await response.json()).recorded,true);
 assert.equal((stored?.p_sample as SystemSample).cpu,25);assert.equal((stored?.p_sample as SystemSample).memory?.rate,60);assert.equal((stored?.p_sample as SystemSample).storageBytes,42939158);
 assert.ok(!JSON.stringify(stored).includes('secret'));
});
test('collector records missing observations honestly and never acknowledges a failed history write',async()=>{
 let writes=0,storageFails=false;
 const handler=createMonitoringCollector(config,async(input,init)=>{
  if(String(input).endsWith('/admin_resource_collection_context'))return Response.json([]);
  if(String(input).endsWith('/privileged/metrics'))throw Error('metrics-secret');
  if(String(input).endsWith('/admin_file_storage_size'))return Response.json({bytes:null});
  writes++;const body=JSON.parse(String(init?.body));assert.equal(body.p_sample.status,'unreachable');assert.equal(body.p_sample.cpu,null);assert.equal(body.p_sample.storageBytes,null);assert.deepEqual(body.p_counters,{});
  return storageFails?new Response('service-secret',{status:503}):Response.json(null);
 },()=>at);
 assert.deepEqual(await (await handler(request())).json(),{recorded:true,status:'unreachable'});
 storageFails=true;const response=await handler(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{recorded:false});assert.equal(writes,2);
});
test('cloud CPU context resets on outages, pauses and counter resets while preserving real zero',()=>{
 let history=advanceMetricsWindow(scrape(),at,[]);
 history=advanceMetricsWindow(scrape(125,35),at+60000,history);assert.equal(history.at(-1)!.sample.cpu,25);
 history=advanceMetricsWindow(scrape(10,10),at+120000,history);assert.equal(history.at(-1)!.sample.cpuIssue,'counter_reset');
 assert.equal(advanceMetricsWindow(scrape(70,10),at+180000,history).at(-1)!.sample.cpu,0);
 const failed={sample:{...sample(180000),status:'unreachable' as const,cpu:null},counters:{}};
 assert.equal(advanceMetricsWindow(scrape(125,35),at+240000,[...history,failed]).at(-1)!.sample.cpuIssue,'initial');
 assert.equal(advanceMetricsWindow(scrape(125,35),at+600000,history).at(-1)!.sample.cpuIssue,'initial');
});
test('file size is independent of resource availability and invalid measurements never become zero',async()=>{
 for(const size of [0,null,-1,'42',1.5,9007199254740992,'failed']){
  let stored:SystemSample|undefined;
  const handler=createMonitoringCollector(config,async(input,init)=>{
   const url=String(input);
   if(url.endsWith('/admin_resource_collection_context'))return Response.json([]);
   if(url.endsWith('/privileged/metrics'))return new Response(scrape());
   if(url.endsWith('/admin_file_storage_size'))return size==='failed'?new Response(null,{status:503}):Response.json({bytes:size});
   stored=JSON.parse(String(init?.body)).p_sample;return new Response(null,{status:204});
  },()=>at);
  assert.equal((await handler(request())).status,200);assert.equal(stored?.memory?.rate,60);assert.equal(stored?.storageBytes,size===0?0:null);
 }
 let stored:SystemSample|undefined;
 const handler=createMonitoringCollector(config,async(input,init)=>{
  const url=String(input);
  if(url.endsWith('/admin_resource_collection_context'))return Response.json([]);
  if(url.endsWith('/privileged/metrics'))throw Error('Metrics unavailable');
  if(url.endsWith('/admin_file_storage_size'))return Response.json({bytes:42});
  stored=JSON.parse(String(init?.body)).p_sample;return new Response(null,{status:204});
 },()=>at);
 await handler(request());assert.equal(stored?.status,'unreachable');assert.equal(stored?.databaseBytes,null);assert.equal(stored?.storageBytes,42);
});
test('cloud reads never scrape resources and retain local history with cloud precedence, isolated range caches and durable events',async()=>{
 let calls=0,clock=at+60000;
 const old=sample(-60000,5),cloud=sample(0,0);
 const local={read:()=>[old,sample(0,99)]} as unknown as SystemHistoryStore;
 const monitor=createCloudSystemMetricsMonitor(async(input,init)=>{
  calls++;assert.ok(String(input).endsWith('/rest/v1/rpc/admin_read_resource_history'));
  assert.equal(new Headers(init?.headers).get('apikey'),'private-secret');assert.ok([60,360,1440,10080].includes(JSON.parse(String(init?.body)).p_minutes));
  return Response.json({history:[cloud,{...sample(60000),status:'unreachable'}],collectedSince:cloud.observedAt,lastSuccessAt:cloud.observedAt});
 },()=>clock,local);
 const result=await monitor.read(config.url,'private-secret');assert.equal(result.collectionSource,'cloud');assert.equal(result.history.length,3);assert.equal(result.history[1].cpu,0);assert.equal(result.lastSuccessAt,cloud.observedAt);assert.equal(result.current.status,'unreachable');assert.ok(result.events.some(e=>e.kind==='unreachable'));assert.equal(result.collectedSince,cloud.observedAt);
 await monitor.read(config.url,'private-secret');assert.equal(calls,1);
 for(const range of ['6h','24h','7d'] as const)assert.equal((await monitor.read(config.url,'private-secret',range)).range,range);
 await monitor.read('https://other.supabase.co','private-secret');assert.equal(calls,5);
 clock+=31000;await monitor.read(config.url,'private-secret');assert.equal(calls,6);assert.ok(!JSON.stringify(result).includes('private-secret'));
});
test('missing, malformed or failed cloud history cannot silently fall back to local collection or invented zeros',async()=>{
 for(const response of [new Response('private-secret',{status:503}),Response.json({history:[]}),Response.json({history:[{observedAt:'invalid',status:'healthy'}]})]){
  const monitor=createCloudSystemMetricsMonitor(async()=>response);
  await assert.rejects(monitor.read(config.url,'private-secret'));
 }
});

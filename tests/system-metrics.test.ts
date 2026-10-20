import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSystemMetrics,createSystemMetricsMonitor} from '../server/system-metrics.ts';
import {buildResourceChart} from '../src/management/resource-chart.ts';
const scrape=(idle=80,user=20,boot=1000)=>[
 `node_cpu_seconds_total{cpu="0",mode="idle"} ${idle}`,
 `node_cpu_seconds_total{cpu="0",mode="user"} ${user}`,
 'node_memory_MemTotal_bytes 1000', 'node_memory_MemAvailable_bytes 400',
 'node_filesystem_size_bytes{mountpoint="/",fstype="ext4"} 100000',
 'node_filesystem_avail_bytes{mountpoint="/",fstype="ext4"} 10000',
 'node_filesystem_size_bytes{mountpoint="/data",fstype="ext4"} 2000',
 'node_filesystem_avail_bytes{mountpoint="/data",fstype="ext4"} 1500',
 'connection_stats_connection_count{state="active"} 3',
 'connection_stats_connection_count{state="idle"} 7',
 'max_connections_connection_count 60','pg_up 1',
 'pg_database_size_bytes{datname="postgres"} 123',
 'pg_database_size_bytes{datname="template0"} 456',
 `node_boot_time_seconds ${boot}`,
].join('\n');

test('resource readings use database disk, available memory and current connections without inventing initial CPU',()=>{
 const result=parseSystemMetrics(scrape(),1000000);
 assert.equal(result.sample.cpu,null);assert.equal(result.sample.cpuIssue,"initial");
 assert.equal(result.sample.memory?.rate,60);
 assert.equal(result.sample.disk?.rate,25);
 assert.equal(result.sample.disk?.total,2000);
 assert.equal(result.sample.connections?.used,10);
 assert.equal(result.sample.databaseBytes,123);
 assert.equal(result.sample.status,'healthy');
});
test('CPU is calculated from matching counter deltas and resets or changed core sets stay unknown',()=>{
 const first=parseSystemMetrics(scrape(),1000000);
 const second=parseSystemMetrics(scrape(125,35),1060000,first);
 assert.equal(second.sample.cpu,25);
 assert.equal(parseSystemMetrics(scrape(125,35),1120000,second).sample.cpuIssue,"no_change");
 assert.equal(parseSystemMetrics(scrape(1,1),1120000,second).sample.cpu,null);
 assert.equal(parseSystemMetrics(scrape().replaceAll('cpu="0"','cpu="1"'),1120000,second).sample.cpu,null);
});
test('missing metrics and impossible values cannot become healthy or zero',()=>{
 assert.throws(()=>parseSystemMetrics('<html>unavailable</html>',1000000));
 const missing=parseSystemMetrics('node_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 2000',1000000);
 assert.equal(missing.sample.memory,null);assert.equal(missing.sample.status,'unknown');
 const down=parseSystemMetrics(scrape().replace('pg_up 1','pg_up 0'),1000000);
 assert.equal(down.sample.status,'critical');
});
test('collector caches for one minute, isolates projects, detects restart and recovery, and leaves failed samples empty',async()=>{
 let now=1000000,calls=0,failed=false,boot=1000;
 const monitor=createSystemMetricsMonitor(async(url,init)=>{
  calls++;assert.ok(String(url).endsWith('/customer/v1/privileged/metrics'));
  assert.ok(new Headers(init?.headers).get('Authorization')?.startsWith('Basic '));
  if(failed)throw Error('private-token must never reach the response');
  return new Response(scrape(80+calls*30,20+calls*10,boot));
 },()=>now);
 const first=await monitor.read('https://one.supabase.co','private-token');
 await monitor.read('https://one.supabase.co','private-token');assert.equal(calls,1);
 await monitor.read('https://two.supabase.co','other-token');assert.equal(calls,2);
 now+=60000;boot=1060;
 const restarted=await monitor.read('https://one.supabase.co','private-token');
 assert.ok(restarted.events.some(event=>event.kind==='restart'));
 failed=true;now+=60000;
 const unavailable=await monitor.read('https://one.supabase.co','private-token');
 assert.equal(unavailable.current.status,'unreachable');assert.equal(unavailable.current.memory,null);
 assert.equal(unavailable.lastSuccessAt,restarted.current.observedAt);
 assert.ok(!JSON.stringify(unavailable).includes('private-token'));
 failed=false;now+=60000;
 const recovered=await monitor.read('https://one.supabase.co','private-token');
 assert.ok(recovered.events.some(event=>event.kind==='recovered'));
 assert.equal(first.history.length,1);assert.equal(recovered.history.length,4);
});

test('connection saturation can exceed the configured limit without disappearing as unknown',()=>{
 const result=parseSystemMetrics(scrape().replace('state="active"} 3','state="active"} 63'),1000000);
 assert.equal(result.sample.connections?.used,70);
 assert.ok(result.sample.connections!.rate>100);
 assert.equal(result.sample.status,'critical');
});
test('history stays bounded while the original collection start remains unchanged',async()=>{
 let now=1000000;
 const monitor=createSystemMetricsMonitor(async()=>new Response(scrape()),()=>now);
 const first=await monitor.read('https://bounded.supabase.co','secret');
 let last=first;
 for(let index=0;index<365;index++){now+=60000;last=await monitor.read('https://bounded.supabase.co','secret');}
 assert.equal(last.history.length,121);
 assert.equal(last.collectedSince,first.collectedSince);
 assert.notEqual(last.history[0].observedAt,last.collectedSince);
});

test('a database outage and recovery create separate critical and normalized events',async()=>{
 let now=1000000,up=false;
 const monitor=createSystemMetricsMonitor(async()=>new Response(scrape().replace('pg_up 1',`pg_up ${up?1:0}`)),()=>now);
 assert.equal((await monitor.read('https://recovery.supabase.co','secret')).current.status,'critical');
 up=true;now+=60000;
 const recovered=await monitor.read('https://recovery.supabase.co','secret');
 assert.ok(recovered.events.some(event=>event.kind==='normalized'));
 assert.equal(recovered.current.status,'healthy');
});
test('concurrent collector and dashboard reads share one pending scrape',async()=>{
 let calls=0,finish:(response:Response)=>void=()=>{};
 const monitor=createSystemMetricsMonitor(async()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve;});});
 const first=monitor.read('https://concurrent.supabase.co','secret');
 const second=monitor.read('https://concurrent.supabase.co','secret');
 finish(new Response(scrape()));
 const result=await Promise.all([first,second]);
 assert.equal(calls,1);assert.equal(result[0].current.observedAt,result[1].current.observedAt);
});

test('five-minute CPU rates tolerate repeated exporter snapshots and expire genuinely unchanged counters',async()=>{
 let now=1000000,idle=80,user=20;
 const monitor=createSystemMetricsMonitor(async()=>new Response(scrape(idle,user)),()=>now);
 await monitor.read('https://window.supabase.co','secret');
 now+=60000;idle+=45;user+=15;
 assert.equal((await monitor.read('https://window.supabase.co','secret')).current.cpu,25);
 now+=60000;
 const duplicate=await monitor.read('https://window.supabase.co','secret');
 assert.equal(duplicate.current.cpu,25);assert.equal(duplicate.current.cpuIssue,undefined);
 now+=60000;idle+=60;
 const actualIdle=await monitor.read('https://window.supabase.co','secret');
 assert.equal(actualIdle.current.cpu,12.5);
 assert.equal((buildResourceChart(actualIdle.history).paths.cpu.match(/M/g)||[]).length,1);
 for(let i=0;i<5;i++){now+=60000;await monitor.read('https://window.supabase.co','secret');}
 const stale=await monitor.read('https://window.supabase.co','secret');
 assert.equal(stale.current.cpu,null);assert.equal(stale.current.cpuIssue,'no_change');
 assert.equal(stale.current.memory?.rate,60);
});

test('CPU windows discard resets, outages and collection pauses instead of averaging across them',async()=>{
 let now=1000000,idle=80,user=20,failed=false;
 const monitor=createSystemMetricsMonitor(async()=>{if(failed)throw Error('offline');return new Response(scrape(idle,user));},()=>now);
 const read=()=>monitor.read('https://boundaries.supabase.co','secret');
 await read();now+=60000;idle+=45;user+=15;assert.equal((await read()).current.cpu,25);
 now+=60000;idle=10;user=10;assert.equal((await read()).current.cpuIssue,'counter_reset');
 now+=60000;idle+=60;assert.equal((await read()).current.cpu,0);
 now+=60000;failed=true;assert.equal((await read()).current.cpu,null);
 now+=60000;failed=false;idle+=100;user+=20;assert.equal((await read()).current.cpuIssue,'initial');
 now+=60000;idle+=60;assert.equal((await read()).current.cpu,0);
 now+=600000;idle+=600;assert.equal((await read()).current.cpuIssue,'initial');
});

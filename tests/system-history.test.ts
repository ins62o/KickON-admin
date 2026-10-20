import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createSystemHistoryStore} from '../server/system-history.ts';
import {createSystemMetricsMonitor} from '../server/system-metrics.ts';
import type {SystemSample} from '../src/management/system-health.ts';
const base=Date.parse('2026-10-20T00:00:00Z');
const sample=(at:number,cpu:number|null=0):SystemSample=>({observedAt:new Date(at).toISOString(),status:'healthy',cpu,memory:{rate:50,used:500,total:1000},disk:null,connections:null,databaseBytes:null,bootAt:null});

test('disk history survives reopening, isolates projects and limits reads to the requested timestamps',t=>{
 const dir=mkdtempSync(join(tmpdir(),'kickon-history-')),path=join(dir,'private','metrics.sqlite');
 let store=createSystemHistoryStore(path,()=>base);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 store.append('development',sample(base-60000,null));store.append('development',sample(base));store.append('production',sample(base,90));
 store.close();store=createSystemHistoryStore(path,()=>base);
 assert.equal(statSync(path).mode&0o777,0o600);assert.equal(statSync(join(dir,'private')).mode&0o777,0o700);
 assert.deepEqual(store.read('development',base-60000,base).map(row=>row.cpu),[null,0]);
 assert.equal(store.read('production',base,base)[0].cpu,90);assert.equal(store.read('development',base,base).length,1);
 assert.deepEqual(store.read('unknown',0,base),[]);
});

test('multiple connections retain the newest sample per minute and prune only expired history',t=>{
 const dir=mkdtempSync(join(tmpdir(),'kickon-history-')),path=join(dir,'metrics.sqlite');
 const first=createSystemHistoryStore(path,()=>base),second=createSystemHistoryStore(path,()=>base);
 t.after(()=>{first.close();second.close();rmSync(dir,{recursive:true,force:true});});
 first.append('one',sample(base-9*86400000));first.append('one',sample(base-7*86400000,10));
 first.append('one',sample(base+1000,20));second.append('one',sample(base+2000,30));first.append('one',sample(base+500,40));
 assert.deepEqual(first.read('one',0,base+60000).map(row=>row.cpu),[10,30]);
 assert.deepEqual(second.read('one',0,base+60000).map(row=>row.cpu),[10,30]);
});

test('restarted monitors restore seven-day records and concurrent ranges do not reuse another range response',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kickon-history-')),path=join(dir,'metrics.sqlite');
 const store=createSystemHistoryStore(path,()=>base);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const url='https://history.supabase.co';store.append(url,sample(base-6*86400000,15));store.append(url,sample(base-4*3600000,20));
 const monitor=createSystemMetricsMonitor(async()=>new Response('pg_up 1\nnode_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 500'),()=>base,store);
 const [hour,week]=await Promise.all([monitor.read(url,'secret','1h'),monitor.read(url,'secret','7d')]);
 assert.equal(hour.range,'1h');assert.equal(week.range,'7d');assert.equal(hour.history.length,1);assert.equal(week.history.length,3);
 assert.equal(week.historyError,null);assert.ok(!JSON.stringify(week).includes('secret'));
 const restarted=createSystemMetricsMonitor(async()=>{throw Error('offline');},()=>base+180000,store);
 const result=await restarted.read(url,'secret','7d');
 assert.equal(result.current.status,'unreachable');assert.equal(result.history.length,4);assert.equal(result.lastSuccessAt,new Date(base).toISOString());
});

test('storage errors do not turn current healthy readings into failures or silently claim durable history',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kickon-history-')),blocked=join(dir,'file');writeFileSync(blocked,'blocked');
 const store=createSystemHistoryStore(join(blocked,'metrics.sqlite'),()=>base);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const monitor=createSystemMetricsMonitor(async()=>new Response('pg_up 1\nnode_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 500'),()=>base,store);
 const result=await monitor.read('https://errors.supabase.co','secret','7d');
 assert.equal(result.current.memory?.rate,50);assert.equal(result.history.length,1);assert.ok(result.historyError);
 assert.ok(!JSON.stringify(result).includes(blocked));
});

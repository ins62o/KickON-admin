import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAdminMiddleware} from '../server/admin-api.ts';
import {createSystemMetricsMonitor} from '../server/system-metrics.ts';
async function request(handler:ReturnType<typeof createAdminMiddleware>,authorization='Bearer session',origin='http://localhost',range:unknown='1h'){
 const req=Object.assign(Readable.from([JSON.stringify({environment:'production',range})]),{url:'/api/admin/system-metrics',method:'POST',headers:{host:'localhost',origin,'content-type':'application/json',authorization},socket:{remoteAddress:'127.0.0.1'}});
 let status=0,body='';await handler(req as never,{writeHead(code:number){status=code;},end(value:string){body=value;}} as never,()=>{throw Error('route must be handled');});
 return {status,body:JSON.parse(body)};
}
test('monitoring rejects missing authentication and foreign origins before reading metrics',async()=>{
 const handler=createAdminMiddleware({});
 assert.equal((await request(handler,'')).status,401);
 assert.equal((await request(handler,'Bearer session','https://foreign.example')).status,403);
});
test('only active admins receive normalized monitoring data and matching storage plan without manual usage records',async t=>{
 const original=globalThis.fetch;let active=false,calls=0;
 globalThis.fetch=async input=>String(input).includes('/auth/v1/user')?Response.json({id:'admin-id'}):Response.json({user_id:'admin-id',role:'viewer',is_active:active});
 t.after(()=>{globalThis.fetch=original;});
 const monitor=createSystemMetricsMonitor(async()=>{calls++;return new Response('pg_up 1\nnode_memory_MemTotal_bytes 1000\nnode_memory_MemAvailable_bytes 500');});
 const handler=createAdminMiddleware({production:{url:'https://smihjaucucffmsbktnmp.supabase.co',publishableKey:'sb_publishable_test',secret:'private-secret'}},monitor);
 assert.equal((await request(handler)).status,400);assert.equal(calls,0);
 active=true;const response=await request(handler);
 assert.equal(response.status,200);assert.equal(response.body.current.memory.rate,50);
 assert.equal(response.body.storagePlan.plan,'Pro');assert.equal(response.body.storagePlan.databaseIncludedBytes,8e9);assert.equal(response.body.storagePlan.storageIncludedBytes,100e9);
 assert.equal('billing' in response.body,false);assert.equal('items' in response.body.storagePlan,false);assert.ok(!JSON.stringify(response.body).includes('private-secret'));
 assert.equal(response.body.restart.allowed,false);assert.equal(response.body.restart.configured,false);
 assert.equal('projectUsage' in response.body,false);
 const other=createAdminMiddleware({production:{url:'https://other.supabase.co',publishableKey:'sb_publishable_test',secret:'private-secret'}},monitor);
 assert.equal((await request(other)).body.storagePlan,null);
 for(const range of ['1h','6h','24h','7d'])assert.equal((await request(handler,'Bearer session','http://localhost',range)).body.range,range);
 for(const range of ['30d','__proto__',24,null,{}])assert.equal((await request(handler,'Bearer session','http://localhost',range)).status,400);
});

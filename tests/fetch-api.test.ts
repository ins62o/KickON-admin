import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdminFetchHandler} from '../server/fetch-api.ts';
const origin='https://admin.example.test';
test('retry endpoint requires a signed-in active data administrator and fixed production task',async t=>{
 const original=globalThis.fetch;let role='viewer',active=true;let writes=0;
 globalThis.fetch=async input=>String(input).includes('/auth/v1/user')?Response.json({id:'11111111-1111-4111-8111-111111111111'}):String(input).includes('/admin_users')?Response.json({user_id:'11111111-1111-4111-8111-111111111111',role,is_active:active}):(writes++,Response.json([]));
 t.after(()=>{globalThis.fetch=original;});
 const handler=createAdminFetchHandler({production:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test',secret:'server-secret'}},[origin]);
 const request=(jobName='kickon-post-match-football-sync',auth=true)=>new Request('https://example.supabase.co/functions/v1/admin-api/sync-retry',{method:'POST',headers:{origin,'content-type':'application/json',...(auth?{authorization:'Bearer session'}:{})},body:JSON.stringify({environment:'production',jobName,requestId:'11111111-1111-4111-8111-111111111111'})});
 assert.equal((await handler(request(undefined,false))).status,401);assert.equal((await handler(request())).status,403);
 role='admin';active=false;assert.equal((await handler(request())).status,400);active=true;
 assert.equal((await handler(request('arbitrary-job'))).status,400);assert.equal(writes,0);
});
test('deployed API allows only the configured origin and authenticated JSON POST requests',async()=>{
 const handler=createAdminFetchHandler({},[origin]);
 const req=(method='POST',body=JSON.stringify({environment:'production'}),headers:Record<string,string>={origin,'content-type':'application/json'})=>new Request('https://example.supabase.co/functions/v1/admin-api/system-metrics',{method,headers,...(method==='POST'?{body}:{})});
 assert.equal((await handler(req('POST','{}',{origin:'https://evil.example'}))).status,403);
 assert.equal((await handler(req('POST','{}',{}))).status,403);
 const preflight=await handler(req('OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await handler(req('GET'))).status,405);
 assert.equal((await handler(req())).status,401);
 assert.equal((await handler(req('POST','{}', {origin,'content-type':'text/plain'}))).status,403);
 assert.equal((await handler(req('POST',JSON.stringify({environment:'production',reason:'x'.repeat(3000)})))).status,413);
 const noTarget=await handler(req('POST',JSON.stringify({environment:'production'}),{origin,'content-type':'application/json',authorization:'Bearer fake-session'}));assert.equal(noTarget.status,503);assert.ok(!(await noTarget.text()).includes('fake-session'));
});
test('cloud API retains membership checks and serves recorded measurements without exposing private configuration',async t=>{
 const original=globalThis.fetch;let active=false;
 globalThis.fetch=async input=>String(input).includes('/auth/v1/user')?Response.json({id:'admin-id'}):Response.json({user_id:'admin-id',role:'viewer',is_active:active});
 t.after(()=>{globalThis.fetch=original;});
 const history={history:[{observedAt:new Date().toISOString(),status:'healthy',cpu:1,memory:{used:1,total:2,rate:50},disk:null,connections:null,databaseBytes:10,bootAt:null}],collectedSince:null,lastSuccessAt:null};
 const handler=createAdminFetchHandler({production:{url:'https://smihjaucucffmsbktnmp.supabase.co',publishableKey:'sb_publishable_test',secret:'private-service-secret'}},[origin],async input=>String(input).includes('admin_read_resource_history')?Response.json(history):Response.json(null));
 const request=()=>new Request('https://example.supabase.co/functions/v1/admin-api/system-metrics',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer session'},body:JSON.stringify({environment:'production'})});
 assert.equal((await handler(request())).status,400);active=true;
 const response=await handler(request()),text=await response.text();assert.equal(response.status,200);assert.equal(JSON.parse(text).current.memory.rate,50);assert.ok(!text.includes('private-service-secret'));assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});

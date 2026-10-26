import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createAdminMiddleware} from '../server/admin-api.ts';

async function request(handler:ReturnType<typeof createAdminMiddleware>,authorization='Bearer admin-session',origin='http://localhost'){
  const req=Object.assign(Readable.from([JSON.stringify({environment:'development'})]),{url:'/api/admin/provider-usage',method:'POST',headers:{host:'localhost',origin,'content-type':'application/json',authorization},socket:{remoteAddress:'127.0.0.1'}});
  let status=0,payload='';
  const res={writeHead(code:number){status=code;},end(body:string){payload=body;}};
  await handler(req as never,res as never,()=>{throw Error('route should be handled');});
  return {status,body:JSON.parse(payload)};
}

test('provider usage rejects missing authentication and foreign origins before making requests',async()=>{
  const handler=createAdminMiddleware({});
  assert.equal((await request(handler,'')).status,401);
  assert.equal((await request(handler,'Bearer session','https://foreign.example')).status,403);
});

test('provider usage requires an active administrator and returns only measured quota fields',async t=>{
  const original=globalThis.fetch;
  let active=false,providerCalls=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:'admin-id',email:'admin@example.com'});
    if(url.includes('/rest/v1/admin_users'))return Response.json({user_id:'admin-id',role:'viewer',is_active:active});
    if(url.startsWith('https://api.sportmonks.com/')){
      providerCalls++;
      assert.equal(new Headers(init?.headers).get('Authorization'),'private-provider-token');
      return Response.json({rate_limit:{remaining:1980,resets_in_seconds:300,requested_entity:'Fixture'}});
    }
    throw Error('unexpected request');
  };
  t.after(()=>{globalThis.fetch=original;});
  const handler=createAdminMiddleware({development:{url:'https://admin.example.com',publishableKey:'sb_publishable_test',secret:'sb_secret_test',sportmonksToken:'private-provider-token'}});
  assert.equal((await request(handler)).status,400);
  assert.equal(providerCalls,0);
  active=true;
  const result=await request(handler);
  assert.equal(result.status,200);
  assert.equal(result.body.observation.remaining,1980);
  assert.equal(providerCalls,1);
  assert.ok(!JSON.stringify(result).includes('private-provider-token'));
});

test('an authorized administrator gets a specific configuration error when the provider token is missing',async t=>{
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:'admin-id',email:'admin@example.com'});
    if(url.includes('/rest/v1/admin_users'))return Response.json({user_id:'admin-id',role:'viewer',is_active:true});
    throw Error('provider must not be called without a token');
  };
  t.after(()=>{globalThis.fetch=original;});
  const handler=createAdminMiddleware({development:{url:'https://admin.example.com',publishableKey:'sb_publishable_test',secret:'sb_secret_test'}});
  const response=await request(handler);
  assert.equal(response.status,503);
  assert.equal(response.body.code,'PROVIDER_USAGE_NOT_CONFIGURED');
});

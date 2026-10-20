import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {createSystemHistoryStore} from '../server/system-history.ts';
import {createProjectRestartController,projectRef} from '../server/project-restart.ts';
import {createAdminMiddleware} from '../server/admin-api.ts';
import {canRestartDatabase} from '../server/identity.ts';
const ref='a'.repeat(20),url=`https://${ref}.supabase.co`,config={url,managementToken:'private-management-token'};
const input=()=>({actor:'admin-id',environment:'production',requestId:randomUUID(),projectRef:ref,confirmed:true});
function storage(t:{after:(callback:()=>void)=>void},now:()=>number=Date.now){
 const dir=mkdtempSync(join(tmpdir(),'kickon-restart-')),store=createSystemHistoryStore(join(dir,'metrics.sqlite'),now);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;
}
test('restart accepts only admin roles and configured Supabase project URLs',async t=>{
 for(const role of ['admin','super_admin'])assert.equal(canRestartDatabase(role),true);
 for(const role of ['operator','data_editor','support','moderator','viewer','__proto__'])assert.equal(canRestartDatabase(role),false);
 for(const target of ['http://'+ref+'.supabase.co','https://evil.example','https://'+ref+'.supabase.co.evil.example','https://user:password@'+ref+'.supabase.co'])assert.equal(projectRef(target),null);
 let calls=0;const controller=createProjectRestartController(storage(t),async()=>{calls++;return Response.json({});});
 await assert.rejects(controller.request({url},input()),/연결이 설정되지/);
 for(const changes of [{confirmed:false},{projectRef:'b'.repeat(20)},{requestId:'invalid'}])await assert.rejects(controller.request(config,{...input(),...changes}),/다시 확인/);
 assert.equal(calls,0);
});
test('accepted restart is audited and duplicate IDs or cooldown survive controller reconstruction',async t=>{
 let now=Date.now(),calls=0;const store=storage(t,()=>now);
 const fetcher:typeof fetch=async(target,init)=>{calls++;assert.equal(String(target),`https://api.supabase.com/v1/projects/${ref}/restart`);assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-management-token');return Response.json({});};
 let controller=createProjectRestartController(store,fetcher,()=>now);const first=input();
 const result=await controller.request(config,first);assert.equal(result.status,'accepted');assert.equal(store.latestRestart(url)?.actor,'admin-id');
 store.close();
 controller=createProjectRestartController(store,fetcher,()=>now);
 assert.equal((await controller.request(config,first)).status,'accepted');assert.equal(calls,1);
 await assert.rejects(controller.request(config,input()),/5분 후/);
 await assert.rejects(controller.request(config,{...first,actor:'different-admin'}),/다른 재시작/);
 now+=300001;assert.equal((await controller.request(config,input())).status,'accepted');assert.equal(calls,2);
 assert.ok(!JSON.stringify(result).includes(config.managementToken));
});
test('unknown transport outcomes never auto-retry and explicit denials stay failed',async t=>{
 const store=storage(t);
 for(const scenario of ['timeout','server-error','denied']){
  let calls=0;const target={...config,url:`https://${(scenario==='timeout'?'b':scenario==='server-error'?'c':'d').repeat(20)}.supabase.co`};
  const request={...input(),projectRef:projectRef(target.url)};
  const controller=createProjectRestartController(store,async()=>{calls++;if(scenario==='timeout')throw Error('private-management-token');return new Response('',{status:scenario==='denied'?403:503});});
  const result=await controller.request(target,request);assert.equal(result.status,scenario==='denied'?'failed':'unknown');
  assert.equal((await controller.request(target,request)).status,result.status);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes(config.managementToken));
 }
});
test('concurrent requests reserve one durable operation before contacting Supabase',async t=>{
 const store=storage(t);let calls=0,finish:(response:Response)=>void=()=>{};
 const controller=createProjectRestartController(store,async()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve;});});
 const request=input(),first=controller.request(config,request);
 assert.equal((await controller.request(config,request)).status,'pending');assert.equal(calls,1);
 finish(Response.json({}));assert.equal((await first).status,'accepted');
});
test('audit failure prevents dispatch and an outcome-write failure remains uncertain',async t=>{
 const store=storage(t);let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return Response.json({});};
 const blocked=createProjectRestartController({...store,reserveRestart(){throw Error('private-path');}},fetcher);
 await assert.rejects(blocked.request(config,input()),/기록/);assert.equal(calls,0);
 const uncertain=createProjectRestartController({...store,finishRestart(){throw Error('private-path');}},fetcher);const request=input();
 assert.equal((await uncertain.request(config,request)).status,'unknown');assert.equal((await uncertain.request(config,request)).status,'pending');assert.equal(calls,1);
});

test('restart route rechecks authentication, roles, environment and confirmation without leaking credentials',async t=>{
 const original=globalThis.fetch;let role='viewer',active=true,authenticated=true,calls=0;
 globalThis.fetch=async input=>String(input).includes('/auth/v1/user')?authenticated?Response.json({id:'admin-id'}):Response.json({error:'unauthorized'},{status:401}):Response.json({user_id:'admin-id',role,is_active:active});
 t.after(()=>{globalThis.fetch=original;});
 const store=storage(t),controller=createProjectRestartController(store,async()=>{calls++;return Response.json({});});
 const target={...config,publishableKey:'sb_publishable_test',secret:'private-service-token'};
 const handler=createAdminMiddleware({production:target},undefined,controller);
 const request=async(body:Record<string,unknown>,authorization='Bearer local-session',origin='http://localhost')=>{
  const req=Object.assign(Readable.from([JSON.stringify(body)]),{url:'/api/admin/project-restart',method:'POST',headers:{host:'localhost',origin,'content-type':'application/json',authorization},socket:{remoteAddress:'127.0.0.1'}});
  let status=0,payload='';await handler(req as never,{writeHead(value:number){status=value;},end(value:string){payload=value;}} as never,()=>{throw Error('unhandled');});return {status,body:JSON.parse(payload)};
 };
 const body={...input(),environment:'production'};
 assert.equal((await request(body,'')).status,401);assert.equal((await request(body,'Bearer session','https://foreign.example')).status,403);
 assert.equal((await request(body)).status,403);role='operator';assert.equal((await request(body)).status,403);
 role='admin';active=false;assert.equal((await request(body)).status,400);active=true;authenticated=false;assert.equal((await request(body)).status,401);authenticated=true;
 assert.equal((await request({...body,environment:'development'})).status,503);assert.equal((await request({...body,projectRef:'b'.repeat(20)})).status,400);assert.equal((await request({...body,confirmed:false})).status,400);assert.equal(calls,0);
 const accepted=await request({...body,actor:'spoofed-actor'});assert.equal(accepted.status,202);assert.equal(accepted.body.status,'accepted');assert.equal(calls,1);assert.equal(store.latestRestart(url)?.actor,'admin-id');
 assert.ok(!JSON.stringify(accepted).includes('private-'));assert.equal((await request(body)).body.status,'accepted');assert.equal(calls,1);
});

test('each environment uses its own authenticated session, configured project and Management token',async t=>{
 const original=globalThis.fetch,devRef='b'.repeat(20),calls:{url:string;authorization:string|null}[]=[];
 globalThis.fetch=async(input,init)=>{
  const target=String(input),dev=target.includes(devRef),headers=new Headers(init?.headers);
  if(target.includes('/auth/v1/user'))return headers.get('Authorization')===`Bearer ${dev?'dev':'prod'}-session`?Response.json({id:dev?'dev-admin':'prod-admin'}):Response.json({error:'unauthorized'},{status:401});
  return Response.json({role:'admin',is_active:true});
 };
 t.after(()=>{globalThis.fetch=original;});
 const controller=createProjectRestartController(storage(t),async(url,init)=>{calls.push({url:String(url),authorization:new Headers(init?.headers).get('Authorization')});return Response.json({});});
 const handler=createAdminMiddleware({production:{...config,publishableKey:'sb_publishable_test',secret:'service-prod'},development:{url:`https://${devRef}.supabase.co`,managementToken:'management-dev',publishableKey:'sb_publishable_test',secret:'service-dev'}},undefined,controller);
 const request=async(environment:string,session:string,project:string)=>{
  const req=Object.assign(Readable.from([JSON.stringify({...input(),environment,projectRef:project})]),{url:'/api/admin/project-restart',method:'POST',headers:{host:'localhost',origin:'http://localhost','content-type':'application/json',authorization:`Bearer ${session}`},socket:{remoteAddress:'127.0.0.1'}});
  let status=0;await handler(req as never,{writeHead(value:number){status=value;},end(){}} as never,()=>{});return status;
 };
 assert.equal(await request('production','dev-session',ref),401);assert.equal(await request('production','prod-session',devRef),400);assert.equal(calls.length,0);
 assert.equal(await request('development','dev-session',devRef),202);assert.equal(await request('production','prod-session',ref),202);
 assert.deepEqual(calls,[{url:`https://api.supabase.com/v1/projects/${devRef}/restart`,authorization:'Bearer management-dev'},{url:`https://api.supabase.com/v1/projects/${ref}/restart`,authorization:'Bearer private-management-token'}]);
});

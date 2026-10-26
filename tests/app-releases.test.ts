import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readAppReleases,readAppReleaseHistory,saveAppRelease} from '../src/management/app-releases.ts';

function fixture(respond:(url:URL,body:Record<string,unknown>)=>Response){
  return createClient('https://releases.example.test','public-test-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>respond(new URL(String(input)),JSON.parse(String(init?.body??'{}')))}});
}
const android={platform:'android',version:'1.0.10',enabled:true,updated_at:'2026-10-22T01:00:00Z'};
const ios={platform:'ios',version:'1.0.9',enabled:false,updated_at:'2026-10-21T01:00:00Z'};

test('release reads include disabled platforms instead of displaying them as unregistered',async()=>{
  const rows=await readAppReleases(fixture(url=>{
    assert.equal(url.pathname,'/rest/v1/app_store_releases');
    assert.equal(url.searchParams.has('enabled'),false);
    return Response.json([android,ios]);
  }));
  assert.deepEqual(rows,[android,ios]);
});
test('platform version and visibility changes use the existing audited RPC',async()=>{
  for(const [platform,version,enabled] of [['android','1.0.10',true],['ios','1.0.9',false]] as const){
    await saveAppRelease(fixture((url,body)=>{
      assert.equal(url.pathname,'/rest/v1/rpc/admin_set_app_store_release');
      assert.equal(body.target_platform,platform);
      assert.equal(body.release_version,version);
      assert.equal(body.release_enabled,enabled);
      assert.ok(typeof body.change_reason==='string'&&body.change_reason.length>=3);
      return new Response(null,{status:204});
    }),platform,` ${version} `,enabled);
  }
});
test('invalid versions never reach the server',async()=>{
  const client=fixture(()=>{throw Error('must not write');});
  for(const version of ['', 'v1.0.3','1.2-beta','1..2','1.2.3.4.5','-1.0','1e2','9'.repeat(41)]){
    await assert.rejects(saveAppRelease(client,'android',version,true),/버전/);
  }
});
test('history queries are limited to app releases and keep complete before and after settings',async()=>{
  const entry={id:24,action:'UPDATE',actor_role:'admin',entity_id:'android',reason:'출시 버전 변경',before_value:{...android,version:'1.0.9'},after_value:android,created_at:android.updated_at};
  assert.deepEqual(await readAppReleaseHistory(fixture(url=>{
    assert.equal(url.pathname,'/rest/v1/admin_audit_logs');
    assert.equal(url.searchParams.get('entity_type'),'eq.app_store_releases');
    assert.equal(url.searchParams.get('order'),'id.desc');
    assert.equal(url.searchParams.get('limit'),'50');
    return Response.json([entry]);
  })),[entry]);
});
test('permission and missing setup errors cannot be presented as successful saves',async()=>{
  for(const [payload,expected] of [[{code:'42501',message:'ADMIN_REQUIRED'},/권한/],[{code:'PGRST202',message:'function missing'},/DB 설정/],[{code:'08006',message:'connection failure'},/저장하지/]] as const){
    await assert.rejects(saveAppRelease(fixture(()=>Response.json(payload,{status:400})),'ios','1.0.3',true),expected);
  }
  await assert.rejects(readAppReleases(fixture(()=>Response.json({code:'42P01',message:'missing table'},{status:400}))),/DB 설정/);
  await assert.rejects(readAppReleases(fixture(()=>Response.json({message:'offline'},{status:503}))),/불러오지/);
});

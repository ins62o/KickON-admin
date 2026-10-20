/* global localStorage */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {chromium} from 'playwright';
import {loadEnv} from 'vite';
import {resolveAdminSettings} from '../../public-auth-config.ts';
const base='http://127.0.0.1:5178';
const settings=resolveAdminSettings(loadEnv('production',process.cwd(),''),'production');
const origins=Object.fromEntries(Object.entries(settings.environments).map(([name,value])=>[new URL(value.url).origin,name]));
const ids={development:'11111111-1111-4111-8111-111111111111',production:'22222222-2222-4222-8222-222222222222'};
const user=environment=>({id:ids[environment],email:'qa@example.test',email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}});
const token=environment=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:ids[environment],email:'qa@example.test',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.qa-signature`;
const session=environment=>({access_token:token(environment),refresh_token:`qa-refresh-${environment}`,token_type:'bearer',expires_in:3600,user:user(environment)});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const failure of [false,true]){
  const context=await browser.newContext();const requests=[];const errors=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),environment=origins[url.origin];
   if(url.origin===base){
    if(url.pathname==='/api/admin/environment'){
     const body=request.postDataJSON();requests.push({type:'handoff',body});
     assert.deepEqual(body,{environment:'development',target:'production'});
     assert.equal(request.headers().authorization,`Bearer ${token('development')}`);
     return route.fulfill(failure?{status:400,json:{error:'QA 운영 관리자 권한 없음'}}:{json:session('production')});
    }
    if(url.pathname.startsWith('/api/admin/'))return route.fulfill({status:503,json:{error:'QA 집계 미연결'}});
    return route.continue();
   }
   if(!environment)return route.abort();
   if(url.pathname==='/auth/v1/token'){
    requests.push({type:'password',environment});assert.equal(environment,'development');
    assert.deepEqual(request.postDataJSON(),{email:'qa@example.test',password:'qa-password',gotrue_meta_security:{}});
    return route.fulfill({json:session(environment)});
   }
   if(url.pathname==='/auth/v1/user')return route.fulfill({json:user(environment)});
   if(url.pathname==='/auth/v1/logout'){requests.push({type:'logout',environment});return route.fulfill({status:204});}
   if(url.pathname==='/rest/v1/admin_users')return route.fulfill({json:{user_id:ids[environment],role:'super_admin',display_name:'QA 관리자',is_active:true}});
   if(url.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
   return route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByRole('heading',{name:'KICKON ADMIN',exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox').count(),0);
  await page.getByLabel('이메일',{exact:true}).fill('qa@example.test');await page.getByLabel('비밀번호',{exact:true}).fill('qa-password');await page.getByRole('button',{name:'로그인',exact:true}).click();
  if(failure){
   await page.getByRole('alert').filter({hasText:'QA 운영 관리자 권한 없음'}).waitFor();
   assert.equal(await page.getByRole('navigation',{name:'관리자 메뉴',exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('kickon-admin-auth-development')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('kickon-admin-auth-production')),null);
  }else{
   await page.getByRole('heading',{name:'대시보드',level:1,exact:true}).waitFor();
   await page.getByRole('button',{name:'계정 메뉴',exact:true}).click();
   await page.getByRole('combobox',{name:'현재 환경: 운영',exact:true}).waitFor();
   await page.getByRole('button',{name:'로그아웃',exact:true}).click();
   await page.getByRole('heading',{name:'KICKON ADMIN',exact:true}).waitFor();
   assert.equal(await page.getByRole('combobox').count(),0);
   for(const environment of Object.keys(ids))assert.equal(await page.evaluate(environment=>localStorage.getItem(`kickon-admin-auth-${environment}`),environment),null);
  }
  assert.equal(requests.filter(row=>row.type==='password').length,1);
  assert.equal(requests.filter(row=>row.type==='handoff').length,1);
  assert.deepEqual(errors,[]);
  console.log(`PASS shared login ${failure?'handoff rejection':'production entry and logout'}`);
  await context.close();
 }
}finally{await browser.close();}

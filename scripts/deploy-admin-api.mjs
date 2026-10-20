import {loadEnv} from 'vite';
import process from 'node:process';
import console from 'node:console';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {resolveAdminSettings} from '../public-auth-config.ts';
const cwd=process.cwd(),ref='smihjaucucffmsbktnmp',origin='https://admin.kickon.kr';
const settings=resolveAdminSettings(loadEnv('production',cwd,''),'production');
const values={KICKON_ADMIN_ORIGINS:origin},summary={};
for(const environment of ['development','production']){
 const config=settings.environments[environment],env=loadEnv(environment,cwd,'');
 if(!config||!env.SUPABASE_METRICS_SECRET_KEY)throw Error(`Missing private ${environment} configuration`);
 const expected=environment==='production'?ref:'uvsmyftwwucrvoteajpi';
 if(config.url!==`https://${expected}.supabase.co`)throw Error(`Unexpected ${environment} project`);
 const prefix=`KICKON_ADMIN_${environment.toUpperCase()}_`;
 Object.assign(values,{[prefix+'URL']:config.url,[prefix+'PUBLISHABLE_KEY']:config.publishableKey,[prefix+'SECRET']:env.SUPABASE_METRICS_SECRET_KEY,[prefix+'SYNC_SECRET']:env.FOOTBALL_SYNC_SECRET??'',[prefix+'SPORTMONKS_TOKEN']:env.SPORTMONKS_API_TOKEN||env.SPORTSMONKS_API_TOKEN||'',[prefix+'MANAGEMENT_TOKEN']:env.SUPABASE_MANAGEMENT_ACCESS_TOKEN??''});
 summary[environment]={syncConfigured:Boolean(values[prefix+'SYNC_SECRET']),providerConfigured:Boolean(values[prefix+'SPORTMONKS_TOKEN']),restartConfigured:Boolean(values[prefix+'MANAGEMENT_TOKEN'])};
}
if(Object.values(values).some(value=>/[\r\n]/.test(value)))throw Error('Invalid multiline server setting');
const dir=mkdtempSync('/private/tmp/kickon-admin-api-secrets-');
const cli=args=>execFileSync('supabase',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000});
try{
 const path=join(dir,'server.env');writeFileSync(path,Object.entries(values).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});
 cli(['secrets','set','--project-ref',ref,'--env-file',path]);
 cli(['functions','deploy','kickon-admin-api','--project-ref',ref,'--use-api','--no-verify-jwt']);
 const base=`https://${ref}.supabase.co/functions/v1/kickon-admin-api`;
 for(const [label,headers,expected] of [['allowed-origin',{origin,'Content-Type':'application/json'},401],['foreign-origin',{origin:'https://foreign.example','Content-Type':'application/json'},403]]){
  const response=await globalThis.fetch(base+'/system-metrics',{method:'POST',headers,body:JSON.stringify({environment:'production'}),signal:globalThis.AbortSignal.timeout(45000)});
  if(response.status!==expected)throw Error(`API ${label} boundary returned ${response.status}`);
  await response.body?.cancel();
 }
 console.log(JSON.stringify({deployed:true,function:'kickon-admin-api',environments:summary,authorizationBoundaryVerified:true}));
}catch(error){let diagnostic=String(error.stderr??'');for(const value of Object.values(values))if(value.length>10)diagnostic=diagnostic.replaceAll(value,'[hidden]');console.error(JSON.stringify({deployed:false,reason:error.code??error.message?.slice(0,180)??'API deployment failed',diagnostic:diagnostic.slice(-2400)}));process.exitCode=1;}
finally{rmSync(dir,{recursive:true,force:true});}

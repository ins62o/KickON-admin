import {createSystemMetricsMonitor} from "./system-metrics.ts";
import {isResourceRange} from '../src/management/system-health.ts';
import {storagePlanFor} from "./supabase-usage.ts";
import type {IncomingMessage,ServerResponse} from "node:http";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {providerResult} from "./provider-result.ts";
import {createProviderUsageReader} from "./provider-usage.ts";
import {activeAdmin,canRunSync,canRestartDatabase,sameVerifiedIdentity} from "./identity.ts";
import {projectRef,RestartError,type createProjectRestartController} from './project-restart.ts';
type Environment="development"|"production";
type ServerTarget={url:string;publishableKey:string;secret:string;syncSecret?:string;sportmonksToken?:string;managementToken?:string};
export type ServerTargets=Partial<Record<Environment,ServerTarget>>;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const environment=(value:unknown):value is Environment=>value==="development"||value==="production";
async function membership(client:SupabaseClient,id:string){
  const {data,error}=await client.from("admin_users").select("user_id,role,is_active").eq("user_id",id).maybeSingle();
  if(error||!activeAdmin(data))throw new Error("활성화된 관리자 권한을 확인할 수 없어요");
  return data!;
}
async function handoff(source:SupabaseClient,target:SupabaseClient,targetConfig:ServerTarget,token:string){
  const verified=await source.auth.getUser(token);
  if(verified.error||!verified.data.user)throw new Error("로그인 상태를 다시 확인해 주세요");
  const user=verified.data.user;
  await membership(source,user.id);
  if(!sameVerifiedIdentity(user,user))throw new Error("인증된 관리자 이메일이 필요해요");
  const administrators=await target.from("admin_users").select("user_id,role,is_active").eq("is_active",true);
  if(administrators.error)throw new Error("선택한 환경의 관리자 권한을 확인할 수 없어요");
  let targetId:string|null=null;
  for(const admin of administrators.data??[]){
    if(!activeAdmin(admin))continue;
    const account=await target.auth.admin.getUserById(admin.user_id);
    if(!account.error&&account.data.user&&sameVerifiedIdentity(user,account.data.user)){targetId=admin.user_id;break;}
  }
  if(!targetId)throw new Error("선택한 환경에 동일한 이메일의 활성 관리자 계정이 필요해요");
  const link=await target.auth.admin.generateLink({type:"magiclink",email:user.email!});
  if(link.error||link.data.user?.id!==targetId||!link.data.properties?.hashed_token)throw new Error("환경 전환 인증을 준비하지 못했어요");
  const publicClient=createClient(targetConfig.url,targetConfig.publishableKey,options);
  const signed=await publicClient.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:"magiclink"});
  if(signed.error||!signed.data.session||signed.data.user?.id!==targetId)throw new Error("환경 전환 인증에 실패했어요");
  try {await membership(target,targetId);} catch(error){await publicClient.auth.signOut({scope:"local"});throw error;}
  return {access_token:signed.data.session.access_token,refresh_token:signed.data.session.refresh_token};
}
async function runSync(client:SupabaseClient,config:ServerTarget,token:string,body:Record<string,unknown>){
  const verified=await client.auth.getUser(token);
  if(verified.error||!verified.data.user)throw new Error("로그인 상태를 다시 확인해 주세요");
  const admin=await membership(client,verified.data.user.id);
  if(!canRunSync(admin.role))throw new Error("동기화를 실행할 권한이 없어요");
  const functions={"team-squad":"sync-team-squad","fixture-lineup":"sync-fixture-lineup","team-metrics":"sync-team-metrics"} as const;
  const job=body.job;
  if(typeof job!=="string"||!Object.hasOwn(functions,job)||body.season!==2026||!["kleague","kleague2"].includes(String(body.leagueId)))throw new Error("동기화 범위를 확인해 주세요");
  const leagueId=String(body.leagueId),teamId=String(body.teamId??""),fixtureId=String(body.fixtureId??"");
  if(job==="team-squad"){
    const target=await client.from("league_standings").select("team_id").eq("season",2026).eq("league_id",leagueId).eq("team_id",teamId).maybeSingle();
    if(target.error||!target.data)throw new Error("선택한 리그에 속한 구단을 선택해 주세요");
    if(!config.syncSecret)throw new Error("동기화 서버 인증 설정이 필요해요");
  }
  if(job==="fixture-lineup"){
    const target=await client.from("fixtures").select("id").eq("league_id",leagueId).eq("id",fixtureId).gte("kickoff_at","2026-01-01").lt("kickoff_at","2027-01-01").maybeSingle();
    if(target.error||!target.data)throw new Error("선택한 리그의 경기를 선택해 주세요");
  }
  const functionName=functions[job as keyof typeof functions];
  const reason=String(body.reason??"").trim();
  if(reason.length<3||reason.length>500)throw new Error("실행 사유를 3~500자로 입력해 주세요");
  const started=await client.from("sync_runs").insert({job_key:functionName,trigger_type:"manual",environment:body.environment,status:"running",requested_by:verified.data.user.id,reason,started_at:new Date().toISOString(),target_type:job==="team-squad"?"team":job==="fixture-lineup"?"fixture":null,target_id:job==="team-squad"?teamId:job==="fixture-lineup"?fixtureId:null,metadata:{leagueId,season:2026}}).select("id").single();
  if(started.error||!started.data)throw new Error("실행 기록을 저장하지 못해 동기화를 시작하지 않았어요");
  const payload={triggerType:"manual",season:2026,leagueId,providerLeagueId:leagueId==="kleague"?1034:1362,providerSeasonId:leagueId==="kleague"?26894:27443,seasonId:leagueId==="kleague"?26894:27443,...(job==="team-squad"?{teamId,force:true}:job==="fixture-lineup"?{fixtureId}:{})};
  try{
    const result=await fetch(`${config.url}/functions/v1/${functionName}`,{method:"POST",headers:{"Content-Type":"application/json",apikey:config.publishableKey,Authorization:`Bearer ${token}`,...(job==="team-squad"?{"x-sync-secret":config.syncSecret!}:{})},body:JSON.stringify(payload),signal:AbortSignal.timeout(55000)});
    const response=await result.json().catch(()=>({}));
    if(!result.ok||response.error)throw new Error("동기화 서버가 요청을 완료하지 못했어요");
    const outcome=providerResult(response);
    const recorded=await client.from("sync_runs").update({status:outcome.status,finished_at:new Date().toISOString(),metadata:{leagueId,season:2026,...outcome.details}}).eq("id",started.data.id);
    if(recorded.error)throw new Error("동기화 응답 후 실행 기록 갱신에 실패했어요");
    return {message:outcome.message};
  }catch(error){
    await client.from("sync_runs").update({status:"failed",finished_at:new Date().toISOString(),error_message:"관리자 동기화 요청 실패"}).eq("id",started.data.id);
    throw error;
  }
}
export function createAdminMiddleware(targets:ServerTargets,monitor:Pick<ReturnType<typeof createSystemMetricsMonitor>,'read'>=createSystemMetricsMonitor(),restarts?:ReturnType<typeof createProjectRestartController>){
  const readProviderUsage=createProviderUsageReader();
  const rates=new Map<string,{count:number;until:number}>();
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    const path=req.url?.split("?")[0];
    if(!["/api/admin/environment","/api/admin/sync","/api/admin/provider-usage","/api/admin/system-metrics","/api/admin/project-restart"].includes(path??""))return next();
    const send=(status:number,data:unknown)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(data));};
    if(req.method!=="POST")return send(405,{error:"지원하지 않는 요청이에요"});
    const origin=req.headers.origin;
    if(!origin||![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(origin)||!req.headers["content-type"]?.startsWith("application/json"))return send(403,{error:"허용되지 않은 요청이에요"});
    try{
      let raw="";for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)return send(413,{error:"요청이 너무 커요"});}
      const body=JSON.parse(raw) as Record<string,unknown>;
      if(!body||typeof body!=="object"||!environment(body.environment))return send(400,{error:"환경을 확인해 주세요"});
      const token=/^Bearer (\S+)$/.exec(req.headers.authorization??"")?.[1];
      if(!token)return send(401,{error:"로그인이 필요해요"});
      const source=targets[body.environment];
      if(!source)return send(503,{error:"관리자 인증 서버 설정이 필요해요"});
      const rateKey=`${req.socket.remoteAddress}:${body.environment}`;
      if(rates.size>1000)for(const[key,value]of rates)if(value.until<Date.now())rates.delete(key);
      const rate=rates.get(rateKey);if(rate&&rate.until>Date.now()&&rate.count>=20)return send(429,{error:"잠시 후 다시 시도해 주세요"});
      rates.set(rateKey,rate&&rate.until>Date.now()?{...rate,count:rate.count+1}:{count:1,until:Date.now()+60000});
      const client=createClient(source.url,source.secret,options);
      if(path==="/api/admin/system-metrics"){
        const range=body.range===undefined?'1h':body.range;if(!isResourceRange(range))return send(400,{error:'조회 기간을 확인해 주세요'});
        const verified=await client.auth.getUser(token);
        if(verified.error||!verified.data.user)return send(401,{error:"로그인 상태를 다시 확인해 주세요"});
        const admin=await membership(client,verified.data.user.id);
        const health=await monitor.read(source.url,source.secret,range);
        const ref=new URL(source.url).hostname.split(".")[0];
        return send(200,{...health,storagePlan:storagePlanFor(source.url),dashboardUrl:`https://supabase.com/dashboard/project/${encodeURIComponent(ref)}/observability/database`,restart:{allowed:canRestartDatabase(admin.role),configured:Boolean(source.managementToken&&restarts&&projectRef(source.url)),projectRef:projectRef(source.url),cooldownUntil:await restarts?.cooldownUntil(source.url)??null}});
      }
      if(path==='/api/admin/project-restart'){
        const verified=await client.auth.getUser(token);
        if(verified.error||!verified.data.user)return send(401,{error:'로그인 상태를 다시 확인해 주세요'});
        const admin=await membership(client,verified.data.user.id);
        if(!canRestartDatabase(admin.role))return send(403,{error:'DB 서버를 재시작할 권한이 없어요'});
        if(!restarts)return send(503,{error:'DB 서버 재시작 연결이 설정되지 않았어요'});
        try{return send(202,await restarts.request(source,{actor:verified.data.user.id,environment:body.environment,requestId:body.requestId,projectRef:body.projectRef,confirmed:body.confirmed}));}
        catch(error){return send(error instanceof RestartError?error.status:503,{error:error instanceof RestartError?error.message:'재시작 요청을 처리하지 못했어요'});}
      }
      if(path==="/api/admin/provider-usage"){
        const verified=await client.auth.getUser(token);
        if(verified.error||!verified.data.user)return send(401,{error:"로그인 상태를 다시 확인해 주세요"});
        await membership(client,verified.data.user.id);
        if(!source.sportmonksToken)return send(503,{code:"PROVIDER_USAGE_NOT_CONFIGURED",error:"스포츠 API 사용량 조회 설정이 필요해요"});
        return send(200,{observation:await readProviderUsage(source.sportmonksToken)});
      }
      if(path==="/api/admin/sync")return send(200,await runSync(client,source,token,body));
      if(!environment(body.target)||body.target===body.environment||!targets[body.target])return send(400,{error:"전환할 환경을 확인해 주세요"});
      const target=targets[body.target]!;
      const targetClient=createClient(target.url,target.secret,options);
      const session=await handoff(client,targetClient,target,token);
      if(res.destroyed){await targetClient.auth.admin.signOut(session.access_token,"local");return;}
      return send(200,session);
    }catch(error){return send(400,{error:error instanceof Error?error.message:"요청을 처리하지 못했어요"});}
  };
}

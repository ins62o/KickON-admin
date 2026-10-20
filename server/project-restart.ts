import type {SystemHistoryStore} from './system-history.ts';
import {restartCooldownMs} from './restart-policy.ts';
import type {RestartStatus} from '../src/management/system-health.ts';

export function projectRef(url:string){
 try{const target=new URL(url);return target.protocol==='https:'&&!target.port&&!target.username&&!target.password?/^([a-z0-9]{20})\.supabase\.co$/.exec(target.hostname)?.[1]??null:null;}catch{return null;}
}
export class RestartError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
type RestartStore={ [K in 'reserveRestart'|'finishRestart'|'latestRestart']:(...args:Parameters<SystemHistoryStore[K]>)=>ReturnType<SystemHistoryStore[K]>|Promise<ReturnType<SystemHistoryStore[K]>> };
export function createProjectRestartController(store:RestartStore,fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const cooldown=(at:number)=>new Date(at+restartCooldownMs).toISOString();
 const result=(status:RestartStatus,at:number)=>({status,cooldownUntil:status==='failed'?null:cooldown(at),message:status==='accepted'?'DB 서버 재시작 요청을 보냈어요 복구 상태는 모니터링에서 확인해 주세요':status==='failed'?'이 재시작 요청은 거부됐어요 연결 설정을 확인한 뒤 다시 열어 주세요':'재시작 요청의 처리 결과를 확인할 수 없어요 모니터링을 확인하고 중복 요청을 피해주세요'});
 return {
  async cooldownUntil(url:string){try{const last=await store.latestRestart(url);return last&&last.requestedAt+restartCooldownMs>now()?cooldown(last.requestedAt):null;}catch{return null;}},
  async request(config:{url:string;managementToken?:string},input:{actor:string;environment:string;requestId:unknown;projectRef:unknown;confirmed:unknown}){
   const ref=projectRef(config.url);
   if(!ref||!config.managementToken)throw new RestartError(503,'DB 서버 재시작 연결이 설정되지 않았어요');
   if(input.confirmed!==true||input.projectRef!==ref||typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))throw new RestartError(400,'재시작할 환경과 프로젝트를 다시 확인해 주세요');
   let reservation;
   try{reservation=await store.reserveRestart(config.url,input.actor,input.environment,input.requestId);}catch{throw new RestartError(503,'실행 기록을 저장하지 못해 재시작 요청을 보내지 않았어요');}
   if(reservation.kind==='conflict')throw new RestartError(409,'이 요청은 다른 재시작 작업에 사용됐어요 확인 창을 다시 열어 주세요');
   if(reservation.kind==='cooldown')throw new RestartError(409,'최근 재시작 요청이 있어요 모니터링을 확인한 뒤 5분 후에 다시 시도해 주세요');
   if(reservation.kind==='existing')return result(reservation.record.status,reservation.record.requestedAt);
   let status:RestartStatus='unknown';
   try{
    const response=await fetcher(`https://api.supabase.com/v1/projects/${ref}/restart`,{method:'POST',headers:{Authorization:`Bearer ${config.managementToken}`},signal:AbortSignal.timeout(20000),redirect:'error'});
    status=response.ok?'accepted':response.status>=400&&response.status<500?'failed':'unknown';
    await response.body?.cancel().catch(()=>{});
   }catch{ /* A timeout may still have reached Supabase; never retry it automatically. */ }
   try{await store.finishRestart(input.requestId,status);}catch{return result('unknown',reservation.record.requestedAt);}
   return result(status,reservation.record.requestedAt);
  },
 };
}

import {resourceRanges,type ResourceRange,type SystemSample,type SystemHealth,type SystemEvent} from '../src/management/system-health.ts';
import type {SystemHistoryStore} from './system-history.ts';

export function resourceEvents(history:SystemSample[]):SystemEvent[]{
 const events:SystemEvent[]=[];
 for(let i=0;i<history.length;i++){
  const sample=history[i],last=history[i-1];
  if(last?.bootAt&&sample.bootAt&&last.bootAt!==sample.bootAt)events.push({at:sample.observedAt,kind:'restart',status:sample.status});
  if(sample.status!==last?.status){
   const kind=sample.status==='unreachable'?'unreachable':last?.status==='unreachable'?'recovered':sample.status==='critical'?'critical':sample.status==='warning'?'warning':sample.status==='healthy'&&(last?.status==='critical'||last?.status==='warning')?'normalized':null;
   if(kind)events.push({at:sample.observedAt,kind,status:sample.status});
  }
 }
 return events.slice(-30).reverse();
}
export function createCloudSystemMetricsMonitor(fetcher:typeof fetch=fetch,now:()=>number=Date.now,localHistory?:SystemHistoryStore){
 const cache=new Map<string,{at:number;health:SystemHealth}>();
 return {
  async read(url:string,secret:string,range:ResourceRange='1h'):Promise<SystemHealth>{
   const key=`${url}:${range}`,previous=cache.get(key);if(previous&&now()-previous.at<30000)return previous.health;
   const response=await fetcher(new URL('/rest/v1/rpc/admin_read_resource_history',url),{method:'POST',headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({p_minutes:resourceRanges[range].duration/60000}),signal:AbortSignal.timeout(10000),redirect:'error'});
   if(!response.ok){await response.body?.cancel();throw Error('Cloud monitoring unavailable');}
   const data=await response.json() as {history:SystemSample[];collectedSince:string|null;lastSuccessAt:string|null};
   if(!Array.isArray(data.history)||!data.history.length)throw Error('Cloud monitoring has no observations');
   for(const sample of data.history)if(!Number.isFinite(Date.parse(sample.observedAt))||!['healthy','warning','critical','unknown','unreachable'].includes(sample.status))throw Error('Invalid cloud monitoring history');
   const current=data.history.at(-1)!,end=Date.parse(current.observedAt),from=now()-resourceRanges[range].duration-3600000;
   let historyError:string|null=null;
   const merged=new Map<number,SystemSample>();
   // Preserve existing measured local history during the move, with cloud records taking precedence.
   if(localHistory)try{for(const sample of localHistory.read(url,from,end))merged.set(Math.floor(Date.parse(sample.observedAt)/60000),sample);}catch{historyError='이전 서버의 이력을 읽지 못했어요 Supabase에서 수집한 기록을 표시합니다';}
   for(const sample of data.history)merged.set(Math.floor(Date.parse(sample.observedAt)/60000),sample);
   const history=[...merged.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
   const health:SystemHealth={current,history,range,events:resourceEvents(history),collectedSince:data.collectedSince??current.observedAt,lastSuccessAt:history.filter(sample=>sample.status!=='unreachable').at(-1)?.observedAt??data.lastSuccessAt,historyError,collectionSource:'cloud'};
   cache.set(key,{at:now(),health});return health;
  },
 };
}

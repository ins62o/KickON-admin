import type {SystemSample,SystemHealth,SystemEvent} from '../src/management/system-health.ts';
import {resourceRanges,type ResourceRange} from '../src/management/system-health.ts';
import type {SystemHistoryStore} from './system-history.ts';
import {advanceMetricsWindow,type Reading} from '../supabase/functions/_shared/system-metrics.ts';
export {parseSystemMetrics} from '../supabase/functions/_shared/system-metrics.ts';
export function createSystemMetricsMonitor(fetcher:typeof fetch=fetch,now:()=>number=Date.now,store?:SystemHistoryStore){
 type State={readings:Reading[];lastAttempt:number;history:SystemSample[];events:SystemEvent[];lastSuccessAt:string|null;collectedSince:string;historyError:string|null;pending?:Promise<void>};
 const states=new Map<string,State>();
 const result=(url:string,state:State,range:ResourceRange):SystemHealth=>{
  const current=state.history.at(-1)!,end=Date.parse(current.observedAt),from=end-resourceRanges[range].duration-3600000;
  let history=state.history.filter(sample=>Date.parse(sample.observedAt)>=from);
  if(store)try{
   const saved=store.read(url,from,end);
   const merged=new Map(saved.map(sample=>[Math.floor(Date.parse(sample.observedAt)/60000),sample]));
   for(const sample of history){const key=Math.floor(Date.parse(sample.observedAt)/60000),previous=merged.get(key);if(!previous||sample.observedAt>previous.observedAt)merged.set(key,sample);}
   history=[...merged.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  }catch{state.historyError='이력을 읽지 못했어요 현재 서버에서 수집한 기록만 표시합니다';}
  return {current,history,range,historyError:state.historyError,events:state.events.slice(-30).reverse(),collectedSince:store?history[0]?.observedAt??state.collectedSince:state.collectedSince,lastSuccessAt:history.filter(sample=>sample.status!=='unreachable').at(-1)?.observedAt??state.lastSuccessAt};
 };
 async function read(url:string,secret:string,range:ResourceRange='1h'):Promise<SystemHealth>{
  let state=states.get(url);if(!state){state={readings:[],lastAttempt:-Infinity,history:[],events:[],lastSuccessAt:null,collectedSince:new Date(now()).toISOString(),historyError:null};states.set(url,state);}
  if(state.pending){await state.pending;return result(url,state,range);}
  if(state.history.length&&now()-state.lastAttempt<60000)return result(url,state,range);
  const currentState=state;
  currentState.lastAttempt=now();
  const request=(async()=>{
   const observedAt=now(),last=currentState.history.at(-1);
   let sample:SystemSample;
   try{
    const response=await fetcher(new URL('/customer/v1/privileged/metrics',url),{headers:{Authorization:'Basic '+Buffer.from(`service_role:${secret}`).toString('base64')},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Error('Metrics unavailable');
    const text=await response.text();if(text.length>2000000)throw Error('Metrics too large');
    const previous=currentState.readings.at(-1);
    currentState.readings=advanceMetricsWindow(text,observedAt,currentState.readings);
    const reading=currentState.readings.at(-1)!;
    sample=reading.sample;
    if(previous?.sample.bootAt&&sample.bootAt&&previous.sample.bootAt!==sample.bootAt)currentState.events.push({at:sample.observedAt,kind:'restart',status:sample.status});
    currentState.lastSuccessAt=sample.observedAt;
   }catch{
    currentState.readings=[];
    sample={observedAt:new Date(observedAt).toISOString(),status:'unreachable',cpu:null,memory:null,disk:null,connections:null,databaseBytes:null,bootAt:null};
   }
   if(!last)currentState.events.push({at:sample.observedAt,kind:'started',status:sample.status});
   if(sample.status!==last?.status){
    const kind=sample.status==='unreachable'?'unreachable':last?.status==='unreachable'?'recovered':sample.status==='critical'?'critical':sample.status==='warning'?'warning':sample.status==='healthy'&&(last?.status==='critical'||last?.status==='warning')?'normalized':null;
    if(kind)currentState.events.push({at:sample.observedAt,kind,status:sample.status});
   }
   currentState.history.push(sample);
   currentState.history=currentState.history.filter(item=>Date.parse(item.observedAt)>=observedAt-8*86400000);
   if(store)try{store.append(url,sample);currentState.historyError=null;}catch{currentState.historyError='이력을 저장하지 못했어요 서버 재시작 시 현재 기록이 유지되지 않을 수 있어요';}
   if(currentState.events.length>100)currentState.events.splice(0,currentState.events.length-100);
  })();
  currentState.pending=request;
  try{await request;return result(url,currentState,range);}finally{currentState.pending=undefined;}
 }
 function start(targets:{url:string;secret:string}[]){
  if(!targets.length)return ()=>{};
  const tick=()=>{for(const target of targets)void read(target.url,target.secret);};
  tick();const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);
 }
 return {read,start};
}

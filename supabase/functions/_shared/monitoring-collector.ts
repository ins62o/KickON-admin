import {advanceMetricsWindow,type Reading} from './system-metrics.ts';
import type {SystemSample} from '../../../src/management/system-health.ts';

type Config={url:string;serviceKey:string;metricsKey:string;cronSecret:string};
export function createMonitoringCollector(config:Config,fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 const rpc=async(name:string,body:unknown)=>{
  const response=await fetcher(new URL(`/rest/v1/rpc/${name}`,config.url),{method:'POST',headers:{apikey:config.serviceKey,Authorization:`Bearer ${config.serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Error('Monitoring storage unavailable');}
  const text=await response.text();return text?JSON.parse(text):null;
 };
 return async(request:Request)=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  if(!config.cronSecret||request.headers.get('Authorization')!==`Bearer ${config.cronSecret}`)return new Response(null,{status:401});
  if(!config.url||!config.serviceKey||!config.metricsKey)return new Response(null,{status:503});
  try{
   const context=await rpc('admin_resource_collection_context',{}) as Reading[];
   if(!Array.isArray(context))throw Error('Invalid monitoring context');
   const at=now();let sample:SystemSample,counters:Record<string,number>={};
   try{
    const response=await fetcher(new URL('/customer/v1/privileged/metrics',config.url),{headers:{Authorization:`Basic ${btoa(`service_role:${config.metricsKey}`)}`},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok){await response.body?.cancel();throw Error('Metrics unavailable');}
    const text=await response.text();if(text.length>2000000)throw Error('Metrics too large');
    const reading=advanceMetricsWindow(text,at,context).at(-1)!;sample=reading.sample;counters=reading.counters;
   }catch{
    sample={observedAt:new Date(at).toISOString(),status:'unreachable',cpu:null,memory:null,disk:null,connections:null,databaseBytes:null,bootAt:null};
   }
   try{
    const storage=await rpc('admin_file_storage_size',{}) as {bytes:unknown}|null;
    sample.storageBytes=typeof storage?.bytes==='number'&&Number.isSafeInteger(storage.bytes)&&storage.bytes>=0?storage.bytes:null;
   }catch{sample.storageBytes=null;}
   await rpc('admin_record_resource_sample',{p_sample:sample,p_counters:counters});
   return Response.json({recorded:true,status:sample.status});
  }catch{return Response.json({recorded:false},{status:503});}
 };
}

import {Readable} from 'node:stream';
import {Buffer} from 'node:buffer';
import {createHash} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createAdminMiddleware,type ServerTargets} from './admin-api.ts';
import {createCloudSystemMetricsMonitor} from './cloud-system-metrics.ts';
import {createCloudRestartStore} from './cloud-restart-store.ts';
import {createProjectRestartController} from './project-restart.ts';

export function createAdminFetchHandler(targets:ServerTargets,origins:string[],fetcher:typeof fetch=fetch){
 const middleware=createAdminMiddleware(targets,createCloudSystemMetricsMonitor(fetcher),createProjectRestartController(createCloudRestartStore(targets,fetcher),fetcher));
 const allowed=new Set(origins);
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('origin'),headers=new Headers({'Cache-Control':'no-store','Vary':'Origin, Authorization','Content-Type':'application/json','X-Content-Type-Options':'nosniff'});
  if(!origin||!allowed.has(origin))return new Response(JSON.stringify({error:'허용되지 않은 요청이에요'}),{status:403,headers});
  headers.set('Access-Control-Allow-Origin',origin);
  if(request.method==='OPTIONS'){
   headers.set('Access-Control-Allow-Methods','POST, OPTIONS');headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
   return new Response(null,{status:204,headers});
  }
  const action=/(?:^|\/)(?:kickon-)?admin-api\/([a-z-]+)\/?$/.exec(new URL(request.url).pathname)?.[1];
  if(!action)return new Response(JSON.stringify({error:'요청 경로를 확인해 주세요'}),{status:404,headers});
  const body=Readable.from((async function*(){const reader=request.body?.getReader();if(!reader)return;try{while(true){const item=await reader.read();if(item.done)break;yield Buffer.from(item.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}})());
  const authorization=request.headers.get('authorization')??'';
  const incoming=Object.assign(body,{method:request.method,url:`/api/admin/${action}`,headers:{host:new URL(origin).host,origin,'content-type':request.headers.get('content-type')??'',authorization},socket:{remoteAddress:`edge:${createHash('sha256').update(authorization).digest('hex')}`}});
  let status=404,payload=JSON.stringify({error:'요청 경로를 확인해 주세요'});
  const response={destroyed:false,writeHead(code:number,values:Record<string,string>){status=code;for(const [name,value] of Object.entries(values))headers.set(name,value);},end(value:string){payload=value;}};
  try{await middleware(incoming as unknown as IncomingMessage,response as unknown as ServerResponse,()=>{});}
  catch{return new Response(JSON.stringify({error:'관리자 서버 연결을 확인해 주세요'}),{status:503,headers});}
  return new Response(payload,{status,headers});
 };
}

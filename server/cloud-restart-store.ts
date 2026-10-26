import type {ServerTargets} from './admin-api.ts';
import type {RestartRecord} from './system-history.ts';
import type {RestartStatus} from '../src/management/system-health.ts';
export function createCloudRestartStore(targets:ServerTargets,fetcher:typeof fetch=fetch){
 const rpc=async(project:string,name:string,args:Record<string,unknown>)=>{
  const target=Object.values(targets).find(target=>target.url===project);
  if(!target)throw Error('Unknown restart project');
  const result=await fetcher(new URL(`/rest/v1/rpc/${name}`,project),{method:'POST',headers:{apikey:target.secret,Authorization:`Bearer ${target.secret}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!result.ok){await result.body?.cancel();throw Error('Restart audit unavailable');}
  const text=await result.text();return text?JSON.parse(text):null;
 };
 const projects=new Map<string,string>();
 return {
  async reserveRestart(project:string,actor:string,environment:string,id:string){
   const value=await rpc(project,'admin_project_restart_reserve',{p_project:project,p_actor:actor,p_environment:environment,p_request_id:id}) as {kind:'new'|'existing'|'cooldown';record:RestartRecord}|{kind:'conflict'};
   if(!value||!['new','existing','cooldown','conflict'].includes(value.kind)||value.kind!=='conflict'&&(!value.record||value.record.project!==project||!Number.isFinite(value.record.requestedAt)))throw Error('Invalid restart reservation');
   if(value.kind==='new')projects.set(id,project);
   return value;
  },
  async finishRestart(id:string,status:RestartStatus){
   const project=projects.get(id);if(!project)throw Error('Unknown restart reservation');
   await rpc(project,'admin_project_restart_finish',{p_request_id:id,p_status:status});projects.delete(id);
  },
  async latestRestart(project:string){return await rpc(project,'admin_project_restart_latest',{p_project:project}) as RestartRecord|null;},
 };
}

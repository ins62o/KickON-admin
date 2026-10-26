import type {SupabaseClient} from '@supabase/supabase-js';

export type AppReleasePlatform='android'|'ios';
export type AppRelease={platform:AppReleasePlatform;version:string;enabled:boolean;updated_at:string};
export type AppReleaseHistory={id:number;action:string;actor_role:string;entity_id:AppReleasePlatform;reason:string;before_value:AppRelease|null;after_value:AppRelease;created_at:string};

function check(error:{code?:string;message:string}|null,operation:'read'|'save'){
  if(!error)return;
  if(error.code==='42501'||/ADMIN_REQUIRED|permission|denied/i.test(error.message))throw Error('앱 업데이트 설정을 조회하거나 변경할 권한이 없어요');
  if(['42P01','42883','PGRST202','PGRST205'].includes(error.code??''))throw Error('앱 업데이트 DB 설정을 확인해 주세요');
  throw Error(operation==='save'?'앱 업데이트 설정을 저장하지 못했어요 다시 시도해 주세요':'앱 업데이트 정보를 불러오지 못했어요 다시 시도해 주세요');
}
export async function readAppReleases(client:SupabaseClient):Promise<AppRelease[]>{
  const {data,error}=await client.from('app_store_releases').select('platform,version,enabled,updated_at').order('platform');
  check(error,'read');
  if(!Array.isArray(data))throw Error('앱 업데이트 정보를 불러오지 못했어요 다시 시도해 주세요');
  return data;
}
export async function readAppReleaseHistory(client:SupabaseClient):Promise<AppReleaseHistory[]>{
  const {data,error}=await client.from('admin_audit_logs').select('id,action,actor_role,entity_id,reason,before_value,after_value,created_at').eq('entity_type','app_store_releases').order('id',{ascending:false}).limit(50);
  check(error,'read');
  if(!Array.isArray(data))throw Error('변경 이력을 불러오지 못했어요 다시 시도해 주세요');
  return data;
}
export async function saveAppRelease(client:SupabaseClient,platform:AppReleasePlatform,version:string,enabled:boolean){
  const value=version.trim();
  if(!/^\d+(?:\.\d+){0,3}$/.test(value)||value.length>40)throw Error('출시 버전을 숫자와 점으로 입력해 주세요 예: 1.0.3');
  if(!['android','ios'].includes(platform)||typeof enabled!=='boolean')throw Error('앱 업데이트 설정을 확인해 주세요');
  const {error}=await client.rpc('admin_set_app_store_release',{target_platform:platform,release_version:value,release_enabled:enabled,change_reason:`${platform==='android'?'Android':'iPhone'} 출시 버전 ${value}, 업데이트 안내 ${enabled?'켜기':'끄기'}`});
  check(error,'save');
}

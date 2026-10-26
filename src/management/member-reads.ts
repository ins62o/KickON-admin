import type {SupabaseClient} from "@supabase/supabase-js";
import {enrichMembers,type Member} from "./model.ts";
function check(error:{message:string}|null){if(error)throw new Error(/permission|denied|권한/i.test(error.message)?"이 정보를 조회하거나 변경할 권한이 없어요":"정보를 불러오지 못했어요 다시 시도해 주세요");}
export async function readMemberRoster(client:SupabaseClient):Promise<Member[]>{
  const [admins,emails]=await Promise.all([client.rpc("admin_get_admin_user_ids"),client.rpc("admin_get_user_auth_providers").eq("auth_provider","email")]);
  check(admins.error);check(emails.error);
  if(!Array.isArray(admins.data)||!Array.isArray(emails.data)||admins.data.length>=1000||emails.data.length>=1000)throw new Error("서비스 계정 제외 범위를 확인할 수 없어요");
  const excluded=new Set([...admins.data,...emails.data].map(row=>String(row.user_id)));
  const profiles:Record<string,unknown>[]=[];let cursor="";
  while(true){
    let request=client.from("profiles").select("id,nickname,team_id,registration_completed_at,team:teams(name)").not("registration_completed_at","is",null).order("id").limit(1000);
    if(cursor)request=request.gt("id",cursor);
    const result=await request;check(result.error);
    const page=(result.data??[]) as unknown as Record<string,unknown>[];
    profiles.push(...page.filter(row=>!excluded.has(String(row.id))));
    if(page.length<1000)break;
    cursor=String(page.at(-1)!.id);
  }
  return enrichMembers(profiles.map(profile=>({user_id:String(profile.id),nickname:String(profile.nickname??""),team_id:profile.team_id as string|null,team_name:(profile.team as {name?:string}|null)?.name??null,joined_at:String(profile.registration_completed_at)})),[]);
}

export async function readMemberActivity(client:SupabaseClient):Promise<Member[]>{
  // The activity RPC sorts by recent activity, so it enriches stable IDs only; it never supplies roster totals.
  const details=new Map<string,Member>();
  for(let offset=0;offset<=100000;offset+=100){
    const result=await client.rpc("admin_get_users",{p_query:null,p_limit:100,p_offset:offset});check(result.error);
    if(!Array.isArray(result.data))throw new Error("사용자 조회 응답을 확인할 수 없어요");
    for(const row of result.data as Member[])details.set(row.user_id,row);
    if(result.data.length<100)break;
    if(offset===100000)throw new Error("전체 사용자가 많아 조회 범위를 나눠야 해요");
  }
  return [...details.values()];
}

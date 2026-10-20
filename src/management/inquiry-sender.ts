import type {SupabaseClient} from "@supabase/supabase-js";
import type {Team} from "./model";
export type InquirySenderInfo={nickname:string|null;team:Pick<Team,"id"|"name"|"code">|null};
export async function readInquirySender(client:SupabaseClient,id:string):Promise<InquirySenderInfo>{
  id=id.trim();if(!id)throw new Error("조회할 문의를 확인해 주세요");
  const response=await client.rpc("admin_get_support_inquiry",{p_inquiry_id:id});
  if(response.error)throw new Error(/permission|denied|권한/i.test(response.error.message)?"문의 작성자를 조회할 권한이 없어요":"문의 작성자를 불러오지 못했어요");
  const payload=response.data as {id:string;author:{nickname:string|null;teamId:string|null;teamName:string|null}|null}|null;
  if(!payload||payload.id!==id)throw new Error("문의 작성자 응답을 확인하지 못했어요");
  const author=payload.author;
  return {nickname:author?.nickname?.trim()||null,team:author?.teamId?{id:author.teamId,name:author.teamName??"구단 정보 없음",code:""}:null};
}

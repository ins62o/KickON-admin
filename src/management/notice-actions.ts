import type {SupabaseClient} from "@supabase/supabase-js";
type Notice={id:string;title?:string;content?:string};
function check(error:{message:string;code?:string}|null){
  if(!error)return;
  if(/permission|denied|권한/i.test(error.message))throw new Error("공지를 변경할 권한이 없어요");
  if(error.message.includes("NOTICE_CONFLICT"))throw new Error("다른 관리자가 수정한 공지예요 닫고 다시 열어 주세요");
  if(error.message.includes("NOTICE_NOT_FOUND"))throw new Error("수정할 공지를 찾을 수 없어요 목록을 새로고침해 주세요");
  if(error.code==="PGRST202")throw new Error("공지 수정 기능의 DB 설정이 필요해요");
  throw new Error("공지를 변경하지 못했어요 다시 시도해 주세요");
}
export async function saveNotice(client:SupabaseClient,notice:Notice,title:string,content:string){
  title=title.trim();content=content.trim();
  if(title.length<2||title.length>100||content.length<5||content.length>10000)throw new Error("제목은 2~100자, 내용은 5~10,000자로 입력해 주세요");
  if(typeof notice.title!=="string"||typeof notice.content!=="string")throw new Error("공지 정보를 다시 불러와 주세요");
  const result=await client.rpc("admin_update_community_notice",{p_notice_id:notice.id,p_title:title,p_content:content,p_expected_title:notice.title,p_expected_content:notice.content});
  check(result.error);if(result.data!==notice.id)throw new Error("공지 저장 결과를 확인하지 못했어요 다시 열어 확인해 주세요");
}
export async function setNoticeVisibility(client:SupabaseClient,id:string,hidden:boolean){
  const result=await client.rpc("admin_set_content_visibility",{p_target_type:"POST",p_target_id:id,p_hidden:hidden,p_reason:hidden?"관리자 공지 숨김":"관리자 공지 다시 게시",p_content_report_id:null});
  check(result.error);if(result.data!==true)throw new Error("공지 게시 상태를 확인하지 못했어요 다시 열어 확인해 주세요");
}

import type {SupabaseClient} from "@supabase/supabase-js";
export const reportReasons:Record<string,string>={SPAM:"스팸 · 광고",ABUSE:"욕설 · 비방",HATE:"혐오 표현",PRIVACY:"개인정보",INAPPROPRIATE:"부적절한 내용",OTHER:"기타"};
export const reportTargets:Record<string,string>={POST:"게시글",COMMENT:"댓글",FIXTURE_CHEER:"응원 메시지"};
export const reportStatuses={OPEN:"접수",REVIEWED:"검토 중",RESOLVED:"처리 완료",DISMISSED:"기각"};
type ReportStatus=keyof typeof reportStatuses;
export type ReportDetail={id:string;createdAt:string;reason:string|null;details:string|null;status:ReportStatus;resolutionNote:string|null;targetType:string|null;reporterNickname:string|null;reportedNickname:string|null;reporterTeamId:string|null;reportedTeamId:string|null};
type Payload={report:{id:string;created_at:string;reason?:string;details?:string;status:string;resolution_note?:string;target_type?:string;reporter_user_id?:string};reporter:{nickname?:string;teamId?:string}|null;author:{nickname?:string;teamId?:string}|null};
const stringOrNull=(value:unknown)=>typeof value==="string"&&value.trim()?value:null;
export async function readReportDetail(client:SupabaseClient,id:string):Promise<ReportDetail>{
  id=id.trim();if(!id)throw new Error("조회할 신고를 확인해 주세요");
  const response=await client.rpc("admin_get_content_report",{p_report_id:id});
  if(response.error){
    if(/permission|denied|권한/i.test(response.error.message))throw new Error("이 신고를 조회할 권한이 없어요");
    if(response.error.message.includes("CONTENT_REPORT_NOT_FOUND"))throw new Error("신고를 찾을 수 없어요 목록을 새로고침해 주세요");
    throw new Error("신고 정보를 불러오지 못했어요 다시 시도해 주세요");
  }
  const payload=response.data as Payload|null,row=payload?.report;
  if(!row||row.id!==id||!Number.isFinite(Date.parse(row.created_at))||!Object.hasOwn(reportStatuses,row.status))throw new Error("신고 정보 응답을 확인하지 못했어요 다시 시도해 주세요");
  return {id:row.id,createdAt:row.created_at,reason:stringOrNull(row.reason),details:stringOrNull(row.details),status:row.status as ReportStatus,resolutionNote:stringOrNull(row.resolution_note),targetType:stringOrNull(row.target_type),reporterNickname:stringOrNull(payload?.reporter?.nickname),reportedNickname:stringOrNull(payload?.author?.nickname),reporterTeamId:stringOrNull(payload?.reporter?.teamId),reportedTeamId:stringOrNull(payload?.author?.teamId)};
}

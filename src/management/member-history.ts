import type {SupabaseClient} from "@supabase/supabase-js";
export type MemberHistoryKind="posts"|"comments"|"attendances";
export type AttendanceResult="WIN"|"DRAW"|"LOSS"|"PENDING"|"UNKNOWN";
export type MemberHistoryRow={id:string;title:string;content:string;createdAt:string;context:string;status:string|null;result?:AttendanceResult};
export type MemberHistoryPage={rows:MemberHistoryRow[];total:number;attendanceSummary?:{wins:number;draws:number;losses:number;winRate:number|null}};
type PostRow={id:string;author_id:string;title:string;content:string;created_at:string;moderation_status:string;board:string;team:{name:string}|null};
type CommentRow={id:string;user_id:string;content:string;created_at:string;moderation_status:string;post:{title:string}|null};
type AttendanceRow={id:string;user_id:string;result?:string|null;verified_at:string;stadium_name:string|null;fixture:{home_team_name:string;away_team_name:string}|null};
function check(error:{message:string}|null){if(error)throw new Error(/permission|denied|권한/i.test(error.message)?"이 활동을 조회할 권한이 없어요":"활동 내역을 불러오지 못했어요 다시 시도해 주세요");}
export async function readMemberHistory(client:SupabaseClient,userId:string,kind:MemberHistoryKind,page:number):Promise<MemberHistoryPage>{
  if(!userId.trim()||!Number.isSafeInteger(page)||page<1)throw new Error("조회할 사용자와 페이지를 확인해 주세요");
  if(kind==="attendances"){
    // The existing attendance RPC searches several fields; retain only this user's records.
    const own=new Map<string,AttendanceRow>();
    for(let offset=0;offset<=100000;offset+=100){
      const result=await client.rpc("admin_get_attendance_records",{p_query:userId,p_offset:offset,p_limit:100});check(result.error);
      const payload=result.data as {records:AttendanceRow[];total:number}|null;
      if(!payload||!Array.isArray(payload.records)||!Number.isSafeInteger(payload.total)||payload.total<0)throw new Error("직관 인증 응답을 확인할 수 없어요");
      for(const row of payload.records)if(row.user_id===userId)own.set(row.id,row);
      if(offset+payload.records.length>=payload.total)break;
      if(payload.records.length<100||offset===100000)throw new Error("직관 인증 내역을 모두 확인할 수 없어요");
    }
    const records=[...own.values()].sort((a,b)=>Date.parse(b.verified_at)-Date.parse(a.verified_at)||b.id.localeCompare(a.id));
    const wins=records.filter(row=>row.result==="WIN").length,draws=records.filter(row=>row.result==="DRAW").length,losses=records.filter(row=>row.result==="LOSS").length;
    const settled=wins+draws+losses;
    return {total:records.length,attendanceSummary:{wins,draws,losses,winRate:settled?wins/settled*100:null},rows:records.slice((page-1)*15,page*15).map(row=>({id:row.id,title:row.fixture?`${row.fixture.home_team_name} vs ${row.fixture.away_team_name}`:"직관 인증",content:"",createdAt:row.verified_at,context:row.stadium_name??"경기장 미확인",status:null,result:row.result==="WIN"||row.result==="DRAW"||row.result==="LOSS"||row.result==="PENDING"?row.result:"UNKNOWN"}))};
  }
  // Avoid presenting a mobile RLS subset as the member's complete moderation history.
  const permission=await client.rpc("admin_has_capability",{required_capability:"moderation.read"});check(permission.error);
  if(permission.data!==true)throw new Error("이 활동을 조회할 권한이 없어요");
  const table=kind==="posts"?"posts":"comments";
  const fields=kind==="posts"?"id,author_id,title,content,created_at,moderation_status,board,team:teams(name)":"id,user_id,post_id,content,created_at,moderation_status,post:posts(title)";
  const result=await client.from(table).select(fields,{count:"exact"}).eq(kind==="posts"?"author_id":"user_id",userId).order("created_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*15,page*15-1);check(result.error);
  if(!Array.isArray(result.data)||result.count===null)throw new Error("활동 내역 응답을 확인할 수 없어요");
  const rows:MemberHistoryRow[]=kind==="posts"?(result.data as unknown as PostRow[]).map(row=>({id:row.id,title:row.title||"제목 없음",content:row.content??"",createdAt:row.created_at,context:row.board==="TEAM"?(row.team?.name??"구단 게시판"):"자유 게시판",status:row.moderation_status})):(result.data as unknown as CommentRow[]).map(row=>({id:row.id,title:row.content?.slice(0,80)||"내용 없음",content:row.content??"",createdAt:row.created_at,context:row.post?.title??"원문 게시글을 확인할 수 없어요",status:row.moderation_status}));
  return {rows,total:result.count};
}

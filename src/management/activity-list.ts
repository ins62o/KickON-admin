import type {SupabaseClient} from "@supabase/supabase-js";
import type {Team} from "./model";
import type {AttendanceResult} from "./member-history";
export type ActivityKind="community"|"attendances";
export type ActivityRow={id:string;userName:string;userId:string;authorTeam?:Pick<Team,"id"|"name"|"code">|null;attendanceTeam?:Pick<Team,"id"|"name"|"code">|null;teamName:string|null;title:string;content:string;createdAt:string;context:string;status:string|null;result:AttendanceResult|null};
type Post={id:string;author_id:string;author_name:string|null;team_name:string|null;title:string;content:string|null;created_at:string;board:string;moderation_status:string|null};
type Attendance={id:string;team_id:string|null;user_id:string;user_name:string|null;team_name:string|null;verified_at:string;stadium_name:string|null;result:string|null;fixture:{home_team_name:string;away_team_name:string}|null};
export async function readActivityList(client:SupabaseClient,kind:ActivityKind,page:number,query:string):Promise<{rows:ActivityRow[];total:number}>{
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(page*15))throw new Error("조회할 페이지를 확인해 주세요");
  const result=await client.rpc(kind==="community"?"admin_get_community_posts":"admin_get_attendance_records",{p_query:query.trim().slice(0,200),p_offset:(page-1)*15,p_limit:15});
  if(result.error)throw new Error(/permission|denied|권한/i.test(result.error.message)?"이 내역을 조회할 권한이 없어요":"내역을 불러오지 못했어요 다시 시도해 주세요");
  const payload=result.data as {records:(Post|Attendance)[];total:number}|null;
  if(!payload||!Array.isArray(payload.records)||!Number.isSafeInteger(payload.total)||payload.total<0)throw new Error("목록 응답을 확인할 수 없어요");
  // Keep only the displayed fields; attendance RPC responses also contain coordinates.
  const rows:ActivityRow[]=kind==="community"?(payload.records as Post[]).map(row=>({id:row.id,userName:row.author_name||"이름 없음",userId:row.author_id,teamName:row.team_name,title:row.title||"제목 없음",content:row.content??"",createdAt:row.created_at,context:row.board==="TEAM"?(row.team_name??"구단 게시판"):"자유 게시판",status:row.moderation_status,result:null})):(payload.records as Attendance[]).map(row=>({id:row.id,userName:row.user_name||"이름 없음",userId:row.user_id,attendanceTeam:row.team_id?{id:row.team_id,name:row.team_name??"구단 정보 없음",code:""}:null,teamName:row.team_name,title:row.fixture?`${row.fixture.home_team_name} vs ${row.fixture.away_team_name}`:"경기 정보 없음",content:"",createdAt:row.verified_at,context:row.stadium_name??"경기장 미확인",status:null,result:row.result==="WIN"||row.result==="DRAW"||row.result==="LOSS"||row.result==="PENDING"?row.result:"UNKNOWN"}));
  if(kind==="community"&&rows.length){
    const profiles=await client.from("profiles").select("id,team:teams(id,name,code)").in("id",[...new Set(rows.map(row=>row.userId))]);
    if(profiles.error||!Array.isArray(profiles.data))throw new Error("작성자의 응원 구단을 불러오지 못했어요");
    const teams=new Map((profiles.data as unknown as {id:string;team:Pick<Team,"id"|"name"|"code">|null}[]).map(profile=>[profile.id,profile.team]));
    return {rows:rows.map(row=>({...row,authorTeam:teams.get(row.userId)??null})),total:payload.total};
  }
  return {rows,total:payload.total};
}

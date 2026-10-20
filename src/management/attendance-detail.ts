import type {SupabaseClient} from "@supabase/supabase-js";
import type {AttendanceResult} from "./member-history";
import type {Team} from "./model";
type AttendanceFixture={home_team_name:string;away_team_name:string;kickoff_at:string|null;status:string|null;home_score:number|null;away_score:number|null;league_id:string|null;round:number|null;attendance_latitude:number|null;attendance_longitude:number|null;attendance_radius_meters:number|null};
type AttendanceRecord={id:string;user_id:string;user_name:string|null;team_id:string|null;team_name:string|null;verified_at:string;verification_type:string|null;result:string|null;latitude:number|null;longitude:number|null;distance_from_stadium:number|null;fixture_id:string;stadium_id:string;stadium_name:string|null;stadium_address:string|null;fixture:AttendanceFixture|null};
export type AttendanceDetail={id:string;userId:string;userName:string;team:Pick<Team,"id"|"name"|"code">|null;verifiedAt:string;verificationType:string|null;result:AttendanceResult;coordinates:{latitude:number|null;longitude:number|null};distance:number|null;fixtureId:string;stadiumId:string;stadiumName:string|null;stadiumAddress:string|null;fixture:AttendanceFixture|null};
export async function readAttendanceDetail(client:SupabaseClient,id:string):Promise<AttendanceDetail>{
  if(!id.trim())throw new Error("조회할 인증을 확인해 주세요");
  const response=await client.rpc("admin_get_attendance_records",{p_attendance_id:id,p_offset:0,p_limit:1});
  if(response.error)throw new Error(/permission|denied|권한/i.test(response.error.message)?"이 인증을 조회할 권한이 없어요":"인증 정보를 불러오지 못했어요 다시 시도해 주세요");
  const payload=response.data as {records:AttendanceRecord[]}|null;
  const row=Array.isArray(payload?.records)?payload.records.find(record=>record.id===id):undefined;
  if(!row)throw new Error("인증 정보를 찾을 수 없어요");
  return {id:row.id,userId:row.user_id,userName:row.user_name||"이름 없음",team:row.team_id?{id:row.team_id,name:row.team_name??"구단 정보 없음",code:""}:null,verifiedAt:row.verified_at,verificationType:row.verification_type??null,result:row.result==="WIN"||row.result==="DRAW"||row.result==="LOSS"||row.result==="PENDING"?row.result:"UNKNOWN",coordinates:{latitude:row.latitude??null,longitude:row.longitude??null},distance:row.distance_from_stadium??null,fixtureId:row.fixture_id,stadiumId:row.stadium_id,stadiumName:row.stadium_name??null,stadiumAddress:row.stadium_address??null,fixture:row.fixture??null};
}

import {readInquirySender} from "./inquiry-sender";
import {readAppReleases as loadAppReleases,readAppReleaseHistory as loadAppReleaseHistory,saveAppRelease as updateAppRelease,type AppReleasePlatform} from './app-releases';
import {saveNotice,setNoticeVisibility} from "./notice-actions";
import {readReportDetail} from "./report-detail";
import {readAttendanceDetail} from "./attendance-detail";
import {readActivityList,type ActivityKind} from "./activity-list";
import {readMemberHistory,type MemberHistoryKind} from "./member-history";
import {readMemberRoster,readMemberActivity as loadMemberActivity} from "./member-reads";
import {readTeamPlayers as loadTeamPlayers,saveTeamPlayer as updateTeamPlayer,saveTeamProfile as updateTeamProfile,type TeamPlayer} from './team-detail';
import {authClient} from "../auth/client";
import {readClubPlayers as loadClubPlayers} from './club-summary';
import {readCronJobs as loadCronJobs,readSyncHealth as loadSyncHealth} from './sync-reads';
import {readSyncHistory as loadSyncHistory} from './sync-history';
import {readPushEnabledUsers as loadPushEnabledUsers,readPushMetricRecipients as loadPushMetricRecipients,readPushOverview as loadPushOverview,readPushSettings as loadPushSettings,readPushRecipients as loadPushRecipients,readPushDeliveryDetail as loadPushDeliveryDetail} from './push-settings';
import type {PushMetric,PushFailureReason} from './push-settings';
import type {PushKind,PushResultFilter,PushPhaseFilter} from './push-model';
import {readFixtures as loadFixtures,readFixtureRounds as loadFixtureRounds,readMatchdayFixtures} from "./fixture-reads";
import type {FixtureFilter} from './fixture-reads';
import {matchdayMatches} from './marketing-matchday';
import {SEASON,type Catalogue,type Member,type Team,type Standing} from "./model";
const client=()=>{if(!authClient)throw new Error("로그인이 필요해요");return authClient;};
export const readAppReleases=()=>loadAppReleases(client());
export const readAppReleaseHistory=()=>loadAppReleaseHistory(client());
export const saveAppRelease=(platform:AppReleasePlatform,version:string,enabled:boolean)=>updateAppRelease(client(),platform,version,enabled);
function check(error:{message:string}|null){if(error)throw new Error(/permission|denied|권한/i.test(error.message)?"이 정보를 조회하거나 변경할 권한이 없어요":"정보를 불러오지 못했어요 다시 시도해 주세요");}
export async function readCatalogue():Promise<Catalogue>{
  const [teams,standings]=await Promise.all([client().from("teams").select("id,name,short_name,code,sportmonks_id").order("name"),client().from("league_standings").select("team_id,league_id,season,rank,points,played,won,drawn,lost,goals_for,goals_against,goal_difference,updated_at").eq("season",SEASON)]);
  check(teams.error);check(standings.error);
  return {teams:(teams.data??[]) as Team[],standings:(standings.data??[]) as Standing[]};
}
export const readTeamPlayers=(teamId:string,league:string|null)=>loadTeamPlayers(client(),teamId,league);
export const readClubPlayers=()=>loadClubPlayers(client());
export const saveTeamPlayer=(player:TeamPlayer,form:FormData)=>updateTeamPlayer(client(),player,form);
export const saveTeamProfile=(team:Team,league:string,form:FormData)=>updateTeamProfile(client(),team,league,form);
export async function readMembers():Promise<Member[]>{return readMemberRoster(client());}
export async function readMemberActivity():Promise<Member[]>{return loadMemberActivity(client());}
export type InboxKind="notices"|"inquiries"|"reports";
export type InboxRow={id:string;created_at:string;title?:string;subject?:string;content?:string;status?:string;category?:string;board?:string;team_id?:string;moderation_status?:string;answer_content?:string;reason?:string;details?:string;resolution_note?:string;target_type?:string;post_id?:string;comment_id?:string;cheer_message_id?:string;user_id?:string;reporter_user_id?:string};
export async function readInbox(kind:InboxKind,status:string,page:number,query:string){
  const table=kind==="notices"?"posts":kind==="inquiries"?"support_inquiries":"content_reports";
  const fields=kind==="notices"?"id,title,content,board,team_id,moderation_status,created_at":kind==="inquiries"?"id,user_id,subject,content,category,status,answer_content,created_at":"id,reporter_user_id,target_type,post_id,comment_id,cheer_message_id,reason,details,status,resolution_note,created_at";
  let request=client().from(table).select(fields,{count:"exact"}).order("created_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*15,page*15-1);
  if(kind==="notices")request=request.eq("category","NOTICE");
  if(status!=="all")request=request.eq(kind==="notices"?"moderation_status":"status",status);
  if(query.trim())request=request.ilike(kind==="notices"?"title":kind==="inquiries"?"subject":"details",`%${query.trim().replace(/[%_]/g,"")}%`);
  const result=await request;check(result.error);return {rows:(result.data??[]) as unknown as InboxRow[],total:result.count??0};
}
export async function readOperationCounts(){
  const results=await Promise.all([client().from("posts").select("id",{head:true,count:"exact"}).eq("category","NOTICE").eq("moderation_status","VISIBLE"),client().from("support_inquiries").select("id",{head:true,count:"exact"}).in("status",["RECEIVED","IN_PROGRESS"]),client().from("content_reports").select("id",{head:true,count:"exact"}).in("status",["OPEN","REVIEWED"])]);
  return results.map(result=>result.error?null:result.count);
}
export async function mutate(name:string,args:Record<string,unknown>){const result=await client().rpc(name,args);check(result.error);return result.data;}
export async function updateNotice(notice:InboxRow,title:string,content:string){return saveNotice(client(),notice,title,content);}
export async function changeNoticeVisibility(id:string,hidden:boolean){return setNoticeVisibility(client(),id,hidden);}
export type Fixture={id:string;league_id:string;round:number|null;home_team_id:string;away_team_id:string;stadium_id:string;kickoff_at:string;status:string;home_score:number|null;away_score:number|null;attendance_latitude:number|null;attendance_longitude:number|null;attendance_radius_meters:number};
export type Stadium={id:string;name:string;name_ko:string|null;address?:string|null;latitude:number;longitude:number};
export type SyncJob={sync_key:string;season:number|null;league_id:string|null;last_attempted_at:string|null;last_succeeded_at:string|null;last_error:string|null};
export async function readSyncJobs():Promise<SyncJob[]>{const result=await client().from("football_sync_state").select("sync_key,season,league_id,last_attempted_at,last_succeeded_at,last_error").order("last_attempted_at",{ascending:false}).limit(1000);check(result.error);return result.data??[];}
export const readCronJobs=()=>loadCronJobs(client());
export const readPushSettings=()=>loadPushSettings(client());
export const readPushOverview=()=>loadPushOverview(client());
export const readPushEnabledUsers=(query:string,page:number)=>loadPushEnabledUsers(client(),query,page);
export const readPushMetricRecipients=(metric:Exclude<PushMetric,'enabled'>,query:string,page:number,reason:PushFailureReason='all')=>loadPushMetricRecipients(client(),metric,query,page,reason);
export const readPushRecipients=(kind:PushKind,query:string,page:number,result:PushResultFilter='all',phase:PushPhaseFilter='all')=>loadPushRecipients(client(),kind,query,page,result,phase);
export const readSyncHealth=()=>loadSyncHealth(client());
export const readSyncHistory=(task:string,page:number)=>loadSyncHistory(client(),task,page);
export const readFixtureRounds=(league:string)=>loadFixtureRounds(client(),league);
export const readFixtures=(league:string,team:string,from:string,to:string,page:number,filter:FixtureFilter='all',round='all')=>loadFixtures(client(),league,team,from,to,page,filter,round);
export async function readMarketingMatches(date:string){
 const [catalogue,stadiums,fixtures]=await Promise.all([readCatalogue(),readStadiums(),readMatchdayFixtures(client(),date)]);
 return matchdayMatches(fixtures,catalogue.teams,stadiums);
}
export async function readStadiums():Promise<Stadium[]>{const result=await client().from("stadiums").select("id,name,name_ko,address,latitude,longitude").order("name").order("id");check(result.error);return result.data??[];}

export type SyncRun={id:string;job_key:string;status:string;started_at:string|null;finished_at:string|null;error_message:string|null;target_id:string|null;metadata:Record<string,unknown>|null};
export async function readSyncRuns():Promise<SyncRun[]>{const result=await client().from("sync_runs").select("id,job_key,status,started_at,finished_at,error_message,target_id,metadata").order("created_at",{ascending:false}).limit(20);check(result.error);return result.data??[];}

export async function readUserHistory(userId:string,kind:MemberHistoryKind,page:number){return readMemberHistory(client(),userId,kind,page);}

export async function readAllActivity(kind:ActivityKind,page:number,query:string){return readActivityList(client(),kind,page,query);}

export async function readAttendance(id:string){return readAttendanceDetail(client(),id);}

export async function readReport(id:string){return readReportDetail(client(),id);}

export async function readInquiryAuthor(id:string){return readInquirySender(client(),id);}

export const readPushDeliveryDetail=(outboxId:string)=>loadPushDeliveryDetail(client(),outboxId);

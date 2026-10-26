export const SEASON=2026;
export const leagues=[{value:"all",label:"전체 리그"},{value:"kleague",label:"K리그 1"},{value:"kleague2",label:"K리그 2"}];
export type Team={id:string;name:string;short_name:string;code:string;sportmonks_id:number|null};
export type Standing={team_id:string;league_id:string;season:number;rank:number|null;points:number|null;played:number|null;won:number|null;drawn:number|null;lost:number|null;goals_for:number|null;goals_against:number|null;goal_difference:number|null;updated_at:string};
export type Member={user_id:string;nickname:string;team_id:string|null;team_name:string|null;joined_at:string;post_count:number|null;comment_count:number|null;attendance_count:number|null;received_report_count:number|null;recent_activity_at:string|null;account_status:string};
export type Catalogue={teams:Team[];standings:Standing[]};
export function teamLeague(standings:Standing[],teamId:string|null):string|null {
  const ids=new Set(standings.filter(row=>row.team_id===teamId&&row.season===SEASON).map(row=>row.league_id));
  return ids.size===1?[...ids][0]:null;
}
export function teamStanding(standings:Standing[],teamId:string):Standing|undefined {
  const league=teamLeague(standings,teamId);
  return league?standings.find(row=>row.team_id===teamId&&row.season===SEASON&&row.league_id===league):undefined;
}
export function rankTeamsByStanding(teams:Team[],standings:Standing[]){
  const rank=(standing:Standing|undefined)=>{const value=standing?.rank;return typeof value==='number'&&Number.isFinite(value)&&value>0?value:Infinity;};
  return teams.map(team=>({team,standing:teamStanding(standings,team.id)})).sort((a,b)=>rank(a.standing)-rank(b.standing)||a.team.name.localeCompare(b.team.name,'ko'));
}
export function memberAccountState(status:string):"active"|"suspended"|"unknown" {
  return status==="ACTIVE"?"active":["ACCOUNT_SUSPENDED","COMMUNITY_SUSPENDED"].includes(status)?"suspended":"unknown";
}
export function filterMembers(members:Member[],standings:Standing[],league:string,team:string,query:string,accountState="all"):Member[]{
  const q=query.trim().toLocaleLowerCase();
  return members.filter(user=>(league==="all"||teamLeague(standings,user.team_id)===league)&&(team==="all"||user.team_id===team)&&(accountState==="all"||memberAccountState(user.account_status)===accountState)&&(!q||`${user.nickname} ${user.team_name??""} ${user.user_id}`.toLocaleLowerCase().includes(q)));
}
export function leagueLabel(id:string|null){return leagues.find(item=>item.value===id)?.label??"리그 미분류";}
export function dateLabel(value:string|null,withTime=false){
  if(!value||!Number.isFinite(Date.parse(value)))return "—";
  return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",...(withTime?{hour:"2-digit",minute:"2-digit",hour12:false}:{})}).format(new Date(value));
}

export type MemberCore=Pick<Member,"user_id"|"nickname"|"team_id"|"team_name"|"joined_at">;
export function enrichMembers(profiles:MemberCore[],activity:Member[]):Member[]{
  const details=new Map(activity.map(row=>[row.user_id,row]));
  return profiles.map(profile=>{const detail=details.get(profile.user_id);return {...detail,...profile,post_count:detail?.post_count??null,comment_count:detail?.comment_count??null,attendance_count:detail?.attendance_count??null,received_report_count:detail?.received_report_count??null,recent_activity_at:detail?.recent_activity_at??null,account_status:detail?.account_status??"UNKNOWN"};});
}

export type MemberSortKey='post_count'|'attendance_count'|'joined_at';
export function sortMembers(members:Member[],key:MemberSortKey,direction:'asc'|'desc'):Member[]{
  return [...members].sort((a,b)=>{
    const left=key==='joined_at'?Date.parse(a.joined_at):a[key];
    const right=key==='joined_at'?Date.parse(b.joined_at):b[key];
    if(left===null||!Number.isFinite(left))return right===null||!Number.isFinite(right)?a.user_id.localeCompare(b.user_id):1;
    if(right===null||!Number.isFinite(right))return -1;
    return (direction==='desc'?right-left:left-right)||a.user_id.localeCompare(b.user_id);
  });
}
export function rankTeamsByMembers(teams:Team[],counts:ReadonlyMap<string,number>):Team[]{
  return [...teams].sort((a,b)=>(counts.get(b.id)??0)-(counts.get(a.id)??0)||a.name.localeCompare(b.name,'ko'));
}

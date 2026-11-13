import {TeamMark} from "./TeamMark";
import {MemberDetailDialog} from "./MemberDetailDialog";
import {useResource} from "./useResource";
import {useMemo,useState} from "react";
import {ArrowDown,ArrowUp,ArrowUpDown,ChartNoAxesColumnIncreasing,UsersRound} from "lucide-react";
import {CustomSelect} from "../components/CustomSelect";
import {readCatalogue,readMembers,readMemberActivity} from "./data";
import {sortMembers,enrichMembers,filterMembers,leagueLabel,rankTeamsByMembers,teamLeague,type Catalogue,type Member,type MemberSortKey} from "./model";
import {Dialog,Empty,NumberedPager,SearchField,Stat,WorkspaceSkeleton,WorkspaceTabs} from "./WorkspaceUI";
type MemberSort={key:MemberSortKey;direction:"asc"|"desc"};
function SortHeader({label,column,sort,onSort}:{label:string;column:MemberSortKey;sort:MemberSort|null;onSort:(key:MemberSortKey)=>void}){
  const active=sort?.key===column;
  const Icon=active?(sort.direction==="desc"?ArrowDown:ArrowUp):ArrowUpDown;
  return <th scope="col" className="number-cell" aria-sort={active?(sort.direction==="desc"?"descending":"ascending"):"none"}><button type="button" className="table-sort" data-active={active} aria-label={`${label} ${active&&sort.direction==="desc"?"적은":"많은"} 순으로 정렬`} onClick={()=>onSort(column)}>{label}<Icon size={14} strokeWidth={1.8} aria-hidden="true"/></button></th>;
}
function TeamMembershipCounts({catalogue,members}:{catalogue:Catalogue;members:Member[]}){
  const [league,setLeague]=useState("kleague");
  const counts=new Map<string,number>();
  for(const member of members)if(member.team_id)counts.set(member.team_id,(counts.get(member.team_id)??0)+1);
  const teamIds=new Set(catalogue.teams.map(team=>team.id));
  const unregistered=[...counts].reduce((sum,[id,count])=>sum+(teamIds.has(id)?0:count),0);
  const unassigned=members.filter(member=>!member.team_id).length;
  const extras=[{label:"미등록 구단",count:unregistered},{label:"응원 팀 미설정",count:unassigned}].filter(row=>row.count>0);
  const unclassified=catalogue.teams.filter(team=>{
    const id=teamLeague(catalogue.standings,team.id);
    return id!=="kleague"&&id!=="kleague2";
  });
  const items=[{value:"kleague",label:"K리그 1"},{value:"kleague2",label:"K리그 2"},...(unclassified.length||extras.length?[{value:"unknown",label:"미분류"}]:[])];
  const teams=rankTeamsByMembers(league==="unknown"?unclassified:catalogue.teams.filter(team=>teamLeague(catalogue.standings,team.id)===league),counts);
  const additional=league==="unknown"?extras:[];
  const rows=[...teams.map(team=>({key:team.id,team,label:team.name,count:counts.get(team.id)??0})),...additional.map(row=>({...row,key:row.label,team:undefined}))];
  const maximum=Math.max(1,...rows.map(row=>row.count));
  return <WorkspaceTabs label="가입 현황 리그" value={league} items={items} onChange={setLeague}>
    {!rows.length?<Empty message="이 리그에 등록된 구단이 없어요"/>:<section className="team-membership-group" aria-label={leagueLabel(league==="unknown"?null:league)}>
      <dl>{rows.map(row=><div className="team-membership-row" key={row.key}>
        <dt><TeamMark team={row.team}/><span>{row.label}</span></dt>
        <dd><span className="team-membership-bar" aria-hidden="true"><span style={{width:`${row.count/maximum*100}%`}}/></span><span className="team-membership-value">{row.count.toLocaleString("ko-KR")}<small>명</small></span></dd>
      </div>)}</dl>
    </section>}
  </WorkspaceTabs>;
}
export function UsersWorkspace({active=true}:{active?:boolean}){
  const catalogue=useResource(readCatalogue),members=useResource(readMembers),activity=useResource(readMemberActivity);
  const [team,setTeam]=useState("all"),[query,setQuery]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState<Member|null>(null);
  const [sort,setSort]=useState<MemberSort|null>(null);
  const [showTeamMembership,setShowTeamMembership]=useState(false);
  const standings=catalogue.data?.standings??[],teams=catalogue.data?.teams??[];
  const enriched=useMemo(()=>enrichMembers(members.data??[],activity.data??[]),[members.data,activity.data]);
  const filtered=filterMembers(enriched,standings,"all",team,query);
  const ordered=sortMembers(filtered,sort?.key??"joined_at",sort?.direction??"desc");
  const teamOptions=[{value:"all",label:"모든 응원 팀",icon:<UsersRound size={18} aria-hidden="true"/>},...["kleague","kleague2",null].flatMap(id=>teams.filter(item=>teamLeague(standings,item.id)===id).sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(item=>({value:item.id,label:item.name,group:leagueLabel(id),icon:<TeamMark team={item}/>})))];
  const sortBy=(key:MemberSortKey)=>{setSort(current=>({key,direction:current?.key===key&&current.direction==="desc"?"asc":"desc"}));setPage(1);};
  const statsLoading=members.loading||catalogue.loading;
  const loading=statsLoading||activity.loading,error=members.error||catalogue.error||activity.error;
  if(!active&&selected)setSelected(null);
  if(!active&&showTeamMembership)setShowTeamMembership(false);
  return <div className="management-workspace users-workspace">
    <div className="workspace-stats three"><Stat loading={statsLoading} label="전체 사용자" value={members.data?.length??null} unit="명"/>{["kleague","kleague2"].map(id=><Stat loading={statsLoading} key={id} label={leagueLabel(id)} value={members.data&&catalogue.data?filterMembers(members.data,standings,id,"all","").length:null} unit="명"/>)}</div>
    <section className="workspace-panel">
      <div className="workspace-toolbar table-toolbar user-list-toolbar">
        <h2>사용자 목록</h2>
        <div className="user-list-filters">
          <SearchField value={query} onChange={value=>{setQuery(value);setPage(1);}} placeholder="닉네임 · 사용자 ID 검색"/>
        </div>
        <div className="team-select"><CustomSelect value={team} label="응원 구단" onChange={value=>{setTeam(value);setPage(1);}} options={teamOptions}/></div>
        <button type="button" className="admin-icon-button team-membership-button" aria-label="구단별 가입 현황" title="구단별 가입 현황" aria-haspopup="dialog" onClick={()=>setShowTeamMembership(true)}><ChartNoAxesColumnIncreasing size={20} strokeWidth={1.8} aria-hidden="true"/></button>
      </div>
      {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={()=>{catalogue.reload();members.reload();activity.reload();}}/>:<>
      <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th scope="col">사용자</th><SortHeader label="게시글" column="post_count" sort={sort} onSort={sortBy}/><SortHeader label="직관" column="attendance_count" sort={sort} onSort={sortBy}/></tr></thead><tbody>{ordered.slice((page-1)*15,page*15).map(user=><tr key={user.user_id} className="member-row" onClick={()=>setSelected(user)}><th scope="row"><button type="button" className="member-name" aria-haspopup="dialog"><TeamMark team={teams.find(t=>t.id===user.team_id)}/><b>{user.nickname||"이름 없음"}</b></button></th><td className="number-cell">{user.post_count===null?"—":`${user.post_count.toLocaleString("ko-KR")}건`}</td><td className="number-cell">{user.attendance_count===null?"—":`${user.attendance_count.toLocaleString("ko-KR")}건`}</td></tr>)}</tbody></table></div>
      {!filtered.length?<Empty message="조건에 맞는 사용자가 없어요"/>:null}<NumberedPager total={filtered.length} page={page} onChange={setPage}/></>}
    </section>
    {showTeamMembership?<Dialog title="구단별 가입 현황" className="team-membership-dialog" onClose={()=>setShowTeamMembership(false)}>
      {statsLoading?<WorkspaceSkeleton/>:members.error||catalogue.error?<Empty error={members.error||catalogue.error} retry={()=>{catalogue.reload();members.reload();}}/>:members.data&&catalogue.data?<TeamMembershipCounts catalogue={catalogue.data} members={members.data}/>:null}
    </Dialog>:null}
    {selected?<MemberDetailDialog key={selected.user_id} member={selected} team={teams.find(team=>team.id===selected.team_id)} league={teamLeague(standings,selected.team_id)} onClose={()=>setSelected(null)}/>:null}
  </div>;
}

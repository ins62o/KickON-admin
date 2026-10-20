import {TeamMark} from "./TeamMark";
import {MemberDetailDialog} from "./MemberDetailDialog";
import {useResource} from "./useResource";
import {useMemo,useState} from "react";
import {ArrowDown,ArrowUp,ArrowUpDown,UsersRound} from "lucide-react";
import {CustomSelect} from "../components/CustomSelect";
import {readCatalogue,readMembers,readMemberActivity} from "./data";
import {sortMembers,rankTeamsByMembers,enrichMembers,filterMembers,leagueLabel,leagues,teamLeague,type Member,type MemberSortKey} from "./model";
import {Empty,Pager,Refresh,SearchField,Stat,WorkspaceSkeleton,WorkspaceTabs} from "./WorkspaceUI";
type MemberSort={key:MemberSortKey;direction:"asc"|"desc"};
function SortHeader({label,column,sort,onSort}:{label:string;column:MemberSortKey;sort:MemberSort|null;onSort:(key:MemberSortKey)=>void}){
  const active=sort?.key===column;
  const Icon=active?(sort.direction==="desc"?ArrowDown:ArrowUp):ArrowUpDown;
  return <th scope="col" className="number-cell" aria-sort={active?(sort.direction==="desc"?"descending":"ascending"):"none"}><button type="button" className="table-sort" data-active={active} aria-label={`${label} ${active&&sort.direction==="desc"?"적은":"많은"} 순으로 정렬`} onClick={()=>onSort(column)}>{label}<Icon size={14} strokeWidth={1.8} aria-hidden="true"/></button></th>;
}
export function UsersWorkspace({active=true}:{active?:boolean}){
  const catalogue=useResource(readCatalogue),members=useResource(readMembers),activity=useResource(readMemberActivity);
  const [league,setLeague]=useState("all"),[team,setTeam]=useState("all"),[query,setQuery]=useState(""),[page,setPage]=useState(1),[expanded,setExpanded]=useState(false),[selected,setSelected]=useState<Member|null>(null);
  const [sort,setSort]=useState<MemberSort|null>(null);
  const standings=catalogue.data?.standings??[],teams=catalogue.data?.teams??[];
  const available=teams.filter(item=>league==="all"||teamLeague(standings,item.id)===league);
  const counts=useMemo(()=>{const map=new Map<string,number>();for(const member of members.data??[])if(member.team_id)map.set(member.team_id,(map.get(member.team_id)??0)+1);return map;},[members.data]);
  const enriched=useMemo(()=>enrichMembers(members.data??[],activity.data??[]),[members.data,activity.data]);
  const filtered=filterMembers(enriched,standings,league,team,query);
  const ordered=sortMembers(filtered,sort?.key??"joined_at",sort?.direction??"desc");
  const rankedTeams=rankTeamsByMembers(available,counts);
  const teamOptions=[{value:"all",label:"모든 응원 팀",icon:<UsersRound size={18} aria-hidden="true"/>},...["kleague","kleague2",null].flatMap(id=>available.filter(item=>teamLeague(standings,item.id)===id).sort((a,b)=>a.name.localeCompare(b.name,"ko")).map(item=>({value:item.id,label:item.name,group:leagueLabel(id),icon:<TeamMark team={item}/>})))];
  const sortBy=(key:MemberSortKey)=>{setSort(current=>({key,direction:current?.key===key&&current.direction==="desc"?"asc":"desc"}));setPage(1);};
  const statsLoading=members.loading||catalogue.loading;
  const loading=statsLoading||activity.loading,error=members.error||catalogue.error||activity.error;
  const selectLeague=(value:string)=>{setLeague(value);setTeam("all");setPage(1);};
  if(!active&&selected)setSelected(null);
  return <div className="management-workspace users-workspace">
    <div className="workspace-stats"><Stat loading={statsLoading} label="전체 사용자" value={members.data?.length??null} unit="명"/>{["kleague","kleague2"].map(id=><Stat loading={statsLoading} key={id} label={leagueLabel(id)} value={members.data&&catalogue.data?filterMembers(members.data,standings,id,"all","").length:null} unit="명"/>)}<Stat loading={statsLoading} label="응원 구단" value={catalogue.data?teams.length:null} unit="개"/></div>
    <section className="workspace-panel"><div className="workspace-toolbar"><WorkspaceTabs value={league} items={leagues} onChange={selectLeague}/><div className="workspace-tools"><SearchField value={query} onChange={value=>{setQuery(value);setPage(1);}} placeholder="닉네임 · 사용자 ID 검색"/><Refresh disabled={loading} onClick={()=>{catalogue.reload();members.reload();activity.reload();}}/></div></div>
      {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={()=>{catalogue.reload();members.reload();activity.reload();}}/>:<>
      <div className="club-filter-heading"><h2>구단별 사용자</h2><button className="quiet-button" aria-expanded={expanded} aria-controls="user-club-filters" onClick={()=>setExpanded(value=>!value)}>{expanded?"닫기":"열기"}</button></div>
      <div className="club-filters" id="user-club-filters"><button type="button" className="club-filter" aria-pressed={team==="all"} onClick={()=>{setTeam("all");setPage(1);}}><span className="club-all">ALL</span><span><b>전체 구단</b><small>{filterMembers(members.data??[],standings,league,"all","").length.toLocaleString()}명</small></span></button>{(expanded?rankedTeams:rankedTeams.slice(0,7)).map(item=><button key={item.id} type="button" className="club-filter" aria-pressed={team===item.id} onClick={()=>{setTeam(item.id);setPage(1);}}><TeamMark team={item}/><span><b>{item.short_name||item.name}</b><small>{(counts.get(item.id)??0).toLocaleString()}명</small></span></button>)}</div>
      <div className="workspace-toolbar table-toolbar"><h2>사용자 목록 <span className="inline-count">{filtered.length.toLocaleString("ko-KR")}명</span></h2><div className="user-list-filters"><div className="team-select"><CustomSelect value={team} label="응원 구단" onChange={value=>{setTeam(value);setPage(1);}} options={teamOptions}/></div></div></div>
      <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th scope="col">사용자</th><SortHeader label="게시글" column="post_count" sort={sort} onSort={sortBy}/><SortHeader label="직관" column="attendance_count" sort={sort} onSort={sortBy}/></tr></thead><tbody>{ordered.slice((page-1)*15,page*15).map(user=><tr key={user.user_id} className="member-row" onClick={()=>setSelected(user)}><th scope="row"><button type="button" className="member-name" aria-haspopup="dialog"><TeamMark team={teams.find(t=>t.id===user.team_id)}/><b>{user.nickname||"이름 없음"}</b></button></th><td className="number-cell">{user.post_count===null?"—":`${user.post_count.toLocaleString("ko-KR")}건`}</td><td className="number-cell">{user.attendance_count===null?"—":`${user.attendance_count.toLocaleString("ko-KR")}건`}</td></tr>)}</tbody></table></div>
      {!filtered.length?<Empty message="조건에 맞는 사용자가 없어요"/>:null}<Pager total={filtered.length} page={page} onChange={setPage}/></>}
    </section>
    {selected?<MemberDetailDialog key={selected.user_id} member={selected} team={teams.find(team=>team.id===selected.team_id)} league={teamLeague(standings,selected.team_id)} onClose={()=>setSelected(null)}/>:null}
  </div>;
}

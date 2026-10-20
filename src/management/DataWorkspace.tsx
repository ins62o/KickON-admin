import {adminApiUrl} from '../auth/api.ts';
import {SystemWorkspace} from "./SystemWorkspace";
import {PushWorkspace} from "./PushWorkspace";
import type {PushKind} from "./push-model";
import {ChevronLeft,UsersRound} from "lucide-react";
import {useResource} from "./useResource";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {dataPageUrl,dataTabFromUrl,pageFromUrl,teamIdFromUrl,pushKindFromUrl,pushPageUrl,syncJobFromUrl,syncPageUrl,type DataTab} from '../dashboard/navigation';
import type {AdminIdentity} from "../auth/policy";
import {authClient,authEnvironment} from "../auth/client";
import {CustomSelect} from "../components/CustomSelect";
import {readCatalogue,readClubPlayers,readFixtures,readFixtureRounds,readStadiums,readCronJobs,type Fixture} from "./data";
import {leagueLabel,leagues,SEASON,teamLeague,teamStanding,type Team,type Standing} from "./model";
import {TeamStandings} from './TeamStandings';
import {AutomaticSyncDialog} from './AutomaticSyncDialog';
import {AutomaticSyncTable} from './SyncOverview';
import {SyncHistoryPanel} from './SyncHistory';
import {useSyncHealth} from './useSyncHealth';
import {automaticSyncJobs,type CronJob} from './sync-model';
import {automaticSyncErrors} from './sync-health';
import {ClubNameReview} from './ClubNameReview';
import {TeamMark} from './TeamMark';
import {fixtureDateLabel} from './fixture-schedule';
import {FixtureStatusBadge} from './FixtureStatusBadge';
import {clubSummary,clubsInLeague} from './club-summary';
import {canWrite} from "./permissions";
import {TeamDetailPage} from "./TeamDetailPage";
import {FixtureDetailDialog} from "./FixtureDetailDialog";
import {Badge,Dialog,Empty,Feedback,Pager,Refresh,SearchField,Stat,WorkspaceSkeleton,WorkspaceTabs} from "./WorkspaceUI";
const dataTabs:{value:DataTab;label:string}[]=[{value:"monitoring",label:"서버 모니터링"},{value:"sync",label:"동기화 관리"},{value:"push",label:"푸시 알림"},{value:"fixtures",label:"경기 일정"},{value:"teams",label:"구단 관리"}];
type DataFilters={league:string;query:string;page:number};
export function DataWorkspace({admin}:{admin:AdminIdentity}){
  const [tab,setTab]=useState(()=>dataTabFromUrl(window.location.href)),[toolsTab,setToolsTab]=useState<DataTab|null>(()=>['monitoring','push'].includes(dataTabFromUrl(window.location.href))?null:dataTabFromUrl(window.location.href));
  const [pushOpened,setPushOpened]=useState(tab==="push");
  if(tab==="push"&&!pushOpened)setPushOpened(true);
  const [pushKind,setPushKind]=useState(()=>pushKindFromUrl(window.location.href));
  const [syncJobName,setSyncJobName]=useState(()=>syncJobFromUrl(window.location.href));
  const [teamId,setTeamId]=useState(()=>teamIdFromUrl(window.location.href));
  const [filters,setFilters]=useState<DataFilters>({league:"all",query:"",page:1});
  const restoreRoute=useCallback((value:DataTab,teamId:string|null,push:PushKind|null=null,syncJob:string|null=null)=>{
    if(value!=="monitoring"&&value!=="push"){
      if(value!==toolsTab)setFilters(current=>({...current,query:"",page:1,league:value!=="teams"&&current.league==="unclassified"?"all":current.league}));
      setToolsTab(value);
    }
    setTab(value);
    setTeamId(value==='teams'?teamId:null);
    setPushKind(value==='push'?push:null);
    setSyncJobName(value==='sync'?syncJob:null);
  },[toolsTab]);
  useEffect(()=>{
    const restore=()=>{if(pageFromUrl(window.location.href)==='data')restoreRoute(dataTabFromUrl(window.location.href),teamIdFromUrl(window.location.href),pushKindFromUrl(window.location.href),syncJobFromUrl(window.location.href));};
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[restoreRoute]);
  const navigate=(value:DataTab,selected:string|null=null,replace=false)=>{
    const href=dataPageUrl(window.location.href,value,selected);
    if(href!==window.location.href)window.history[replace?'replaceState':'pushState'](selected?{kickonTeamDetail:true}:null,'',href);
    restoreRoute(value,selected);
  };
  const selectPush=(kind:PushKind)=>{
    const href=pushPageUrl(window.location.href,kind);
    if(href!==window.location.href)window.history.pushState({kickonPushDetail:true},'',href);
    restoreRoute('push',null,kind);
  };
  const closePush=()=>{
    if(window.history.state?.kickonPushDetail&&pushKind)window.history.back();
    else navigate('push',null,true);
  };
  const selectAutomaticSync=(job:CronJob)=>{
    const href=syncPageUrl(window.location.href,job.job_name);
    if(href!==window.location.href)window.history.pushState({kickonSyncDetail:true},'',href);
    restoreRoute('sync',null,null,job.job_name);
  };
  const closeAutomaticSync=()=>{
    if(window.history.state?.kickonSyncDetail&&syncJobName)window.history.back();
    else navigate('sync',null,true);
  };
  const changeTab=(value:string)=>{const next=dataTabs.find(item=>item.value===value);if(next)navigate(next.value);};
  const closeTeam=()=>{
    if(window.history.state?.kickonTeamDetail&&teamId)window.history.back();
    else navigate('teams',null,true);
  };
  return <div className="management-workspace"><div className="workspace-toolbar standalone"><WorkspaceTabs value={tab} items={dataTabs} onChange={changeTab}/></div>
    <div className="data-workspace-view" hidden={tab!=="monitoring"}><SystemWorkspace active={tab==='monitoring'}/></div>
    <div className="data-workspace-view" hidden={tab!=="push"}>{pushOpened?<PushWorkspace active={tab==="push"} kind={pushKind} onSelect={selectPush} onBack={closePush} listHref={pushPageUrl(window.location.href)} href={kind=>pushPageUrl(window.location.href,kind)}/>:null}</div>
    <div className="data-workspace-view" hidden={tab==="monitoring"||tab==="push"}>{toolsTab?<DataToolsWorkspace admin={admin} active={tab!=='monitoring'&&tab!=='push'} tab={toolsTab} filters={filters} onFiltersChange={patch=>setFilters(current=>({...current,...patch}))} syncJobName={syncJobName} onSelectAutomaticSync={selectAutomaticSync} onBackSync={closeAutomaticSync} teamId={teamId} onSelectTeam={team=>navigate('teams',team.id)} onBack={closeTeam}/>:null}</div>
  </div>;
}
function DataToolsWorkspace({admin,active,tab,filters,onFiltersChange,teamId,onSelectTeam,onBack,syncJobName,onSelectAutomaticSync,onBackSync}:{syncJobName:string|null;onSelectAutomaticSync:(job:CronJob)=>void;onBackSync:()=>void;admin:AdminIdentity;active:boolean;tab:string;filters:DataFilters;onFiltersChange:(patch:Partial<DataFilters>)=>void;teamId:string|null;onSelectTeam:(team:Team)=>void;onBack:()=>void}){
  const {league,query,page}=filters;
  const setLeague=(league:string)=>onFiltersChange({league}),setQuery=(query:string)=>onFiltersChange({query}),setPage=(page:number)=>onFiltersChange({page});
  const [team,setTeam]=useState("all"),[message,setMessage]=useState(""),[selectedFixture,setSelectedFixture]=useState<Fixture|null>(null),[selectedTeam,setSelectedTeam]=useState<{team:Team;league:string|null;standing?:Standing}|null>(null),[pending,setPending]=useState(false),[syncDialog,setSyncDialog]=useState(false);
  const [round,setRound]=useState("auto");
  const [clubView,setClubView]=useState<"all"|"empty"|"names">("all");
  const onlyEmptyClubs=clubView==="empty";
  const [clubsOpened,setClubsOpened]=useState(tab==="teams");
  if(tab==="teams"&&!clubsOpened)setClubsOpened(true);
  const clubPlayersLoader=useCallback(()=>clubsOpened?readClubPlayers():Promise.resolve(null),[clubsOpened]);
  const clubPlayers=useResource(clubPlayersLoader);
  const fixtureLeague=league==="unclassified"?"all":league;
  const [job,setJob]=useState("team-metrics"),[syncLeague,setSyncLeague]=useState("kleague"),[syncTeam,setSyncTeam]=useState(""),[fixtureId,setFixtureId]=useState("");
  const [historyRevision,setHistoryRevision]=useState(0);
  const [onlySyncErrors,setOnlySyncErrors]=useState(false);
  const view=active?`${tab}:${syncJobName??''}`:'', [previousView,setPreviousView]=useState(view);
  // Native modal dialogs remain in the top layer when a cached view is hidden.
  if(previousView!==view){setPreviousView(view);setSelectedFixture(null);setSyncDialog(false);setMessage('');}
  const cron=useResource(readCronJobs);
  const health=useSyncHealth(active&&tab==='sync');
  const catalogue=useResource(readCatalogue),stadiums=useResource(readStadiums);
  const roundsLoader=useCallback(()=>readFixtureRounds(fixtureLeague),[fixtureLeague]);
  const rounds=useResource(roundsLoader);
  const selectedRound=round==="auto"?rounds.data?.defaultRound??null:round;
  const fixtureLoader=useCallback(()=>selectedRound===null?Promise.resolve(null):readFixtures(fixtureLeague,team,`${SEASON}-01-01`,`${SEASON}-12-31`,page,false,selectedRound),[fixtureLeague,team,selectedRound,page]);
  const fixtures=useResource(fixtureLoader);
  const writable=canWrite(admin.role,"data"),teams=catalogue.data?.teams??[],standings=catalogue.data?.standings??[];
  const detailTeam=teamId?teams.find(item=>item.id===teamId):null;
  // Keep the detail mounted while its catalogue reloads after saving.
  if(detailTeam&&selectedTeam?.team!==detailTeam)setSelectedTeam({team:detailTeam,league:teamLeague(standings,detailTeam.id),standing:teamStanding(standings,detailTeam.id)});
  const clubs=catalogue.data&&clubPlayers.data?clubSummary(catalogue.data,clubPlayers.data,league):null;
  const leagueTeams=catalogue.data?clubsInLeague(catalogue.data,league):[];
  const clubCount=catalogue.data?leagueTeams.length:null;
  const filteredTeams=leagueTeams.filter(item=>(!onlyEmptyClubs||Boolean(clubs?.emptyTeamIds.includes(item.id)))&&(!query||`${item.name} ${item.code}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const automaticJobs=health.data?automaticSyncJobs(health.data.jobs):cron.data?automaticSyncJobs(cron.data):null;
  const syncErrors=automaticSyncErrors(automaticJobs??[],health.data,health.error);
  const visibleSyncJobs=onlySyncErrors?syncErrors.rows:automaticJobs;
  const detailSync=syncJobName?automaticJobs?.find(job=>job.job_name===syncJobName)??null:null;
  const changeLeague=(value:string)=>{setClubView("all");setLeague(value);setRound("auto");setTeam("all");setPage(1);};
  const refresh=()=>{health.reload();cron.reload();clubPlayers.reload();catalogue.reload();rounds.reload();fixtures.reload();setHistoryRevision(value=>value+1);};
  const startSync=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setMessage("");const form=new FormData(event.currentTarget);
    try{const reason=String(form.get("reason")??"").trim();if(reason.length<3)throw new Error("실행 사유를 3자 이상 입력해 주세요");if(job==="team-squad"&&!syncTeam||job==="fixture-lineup"&&!fixtureId)throw new Error("동기화 대상을 선택해 주세요");setPending(true);
      const session=await authClient!.auth.getSession();const token=session.data.session?.access_token;if(!token)throw new Error("로그인이 필요해요");
      const result=await fetch(adminApiUrl('sync'),{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({environment:authEnvironment,job,season:SEASON,leagueId:syncLeague,teamId:syncTeam,fixtureId,reason})});
      const response=await result.json();if(!result.ok)throw new Error(response.error||"동기화를 요청하지 못했어요");setSyncDialog(false);setMessage(response.message);refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"동기화 서버 연결을 확인해 주세요");}finally{setPending(false);}
  };
  const teamName=(id:string)=>teams.find(item=>item.id===id)?.short_name||teams.find(item=>item.id===id)?.name||id;
  const fixtureTeam=(id:string,away=false)=>{const mark=<TeamMark team={teams.find(item=>item.id===id)}/>;return <span className="fixture-team">{away?null:mark}<span>{teamName(id)}</span>{away?mark:null}</span>;};
  return <div className="data-tools-content"><div hidden={Boolean(teamId)}><div className="data-tools-content"><div className="workspace-toolbar standalone data-section-heading"><h2>{dataTabs.find(item=>item.value===tab)?.label}</h2><div className="workspace-tools">{tab!=="sync"?<><span className="season-label">{SEASON} 시즌</span><CustomSelect label="리그" value={tab==="fixtures"?fixtureLeague:league} options={tab==="teams"?[...leagues,...(teams.some(item=>teamLeague(standings,item.id)===null)?[{value:"unclassified",label:"리그 미분류"}]:[])]:leagues} onChange={changeLeague}/></>:null}<Refresh onClick={refresh} disabled={cron.loading||fixtures.loading}/></div></div>
    <div className="workspace-stats">{tab==="teams"?<><Stat label="등록 구단" value={clubCount} loading={catalogue.loading} unit="개"/><Stat label="전체 선수" value={clubs?.players??null} loading={catalogue.loading||clubPlayers.loading} unit="명"/><Stat label="한글 이름 미등록 선수" value={clubs?.missingNames??null} loading={catalogue.loading||clubPlayers.loading} unit="명" disabled={!clubs} pressed={clubView==="names"} onClick={()=>{setClubView(clubView==="names"?"all":"names");setQuery("");}}/><Stat label="선수단 미등록 구단" value={clubs?.emptyTeams??null} loading={catalogue.loading||clubPlayers.loading} unit="개" disabled={!clubs} pressed={onlyEmptyClubs} onClick={()=>{setClubView(onlyEmptyClubs?"all":"empty");setQuery("");}}/></>:tab==="sync"?<><Stat label="자동 동기화" value={automaticJobs?.length??null} loading={cron.loading} unit="개"/><Stat label="사용 중" value={automaticJobs?.filter(job=>job.active).length??null} loading={cron.loading} unit="개"/><Stat label="중단됨" value={automaticJobs?.filter(job=>!job.active).length??null} loading={cron.loading} unit="개"/><Stat label="오류 작업" value={syncErrors.count} loading={!health.data&&!health.error} unit="개" disabled={!health.data||Boolean(health.error)} pressed={onlySyncErrors} onClick={()=>setOnlySyncErrors(value=>!value)}/></>:tab==="fixtures"?<><Stat label="등록 경기" value={rounds.data?.summary.total??null} loading={rounds.loading} unit="경기"/><Stat label="예정 경기" value={rounds.data?.summary.scheduled??null} loading={rounds.loading} unit="경기"/><Stat label="오늘 경기" value={rounds.data?.summary.today??null} loading={rounds.loading} unit="경기"/><Stat label="진행 중인 경기" value={rounds.data?.summary.live??null} loading={rounds.loading} unit="경기"/></>:null}</div>
    {tab==="sync"?<section className="workspace-panel"><div className="workspace-toolbar"><h2>{onlySyncErrors?"오류 작업":"자동 동기화"}</h2><div className="workspace-tools">{onlySyncErrors?<button type="button" className="secondary-button" onClick={()=>setOnlySyncErrors(false)}>전체 작업 보기</button>:null}{writable?<button className="primary-button" onClick={()=>setSyncDialog(true)}>수동 동기화</button>:null}</div></div>{cron.loading?<WorkspaceSkeleton/>:cron.error?<Empty error={cron.error} retry={cron.reload}/>:visibleSyncJobs?.length?<AutomaticSyncTable rows={visibleSyncJobs} onSelect={onSelectAutomaticSync} health={health.data} healthError={health.error}/>:<Empty message={onlySyncErrors?"현재 확인된 오류 작업이 없어요":"등록된 자동 동기화가 없어요"}/>}</section>:null}
    {tab==="sync"?<SyncHistoryPanel active={active&&tab==='sync'} jobs={automaticJobs??[]} teams={teams} revision={historyRevision}/>:null}
    {tab==="fixtures"?<section className="workspace-panel"><div className="workspace-toolbar"><h2>{selectedRound&&selectedRound!=="all"?(selectedRound==="unassigned"?"라운드 미분류":`${selectedRound}라운드`):"경기 일정"}</h2><div className="workspace-tools"><CustomSelect label="라운드" value={selectedRound??"all"} disabled={rounds.loading||Boolean(rounds.error)} onChange={value=>{setRound(value);setPage(1);}} options={[{value:"all",label:"전체 라운드"},...(rounds.data?.rounds??[]).map(value=>({value:String(value),label:`${value}라운드`})),...(rounds.data?.hasUnassigned?[{value:"unassigned",label:"라운드 미분류"}]:[])]}/><CustomSelect label="구단" value={team} onChange={value=>{setTeam(value);setPage(1);}} options={[{value:"all",label:"전체 구단",icon:<UsersRound aria-hidden="true"/>},...["kleague","kleague2",null].filter(id=>fixtureLeague==="all"||id===fixtureLeague).flatMap(id=>teams.filter(item=>teamLeague(standings,item.id)===id).map(item=>({value:item.id,label:item.name,group:leagueLabel(id),icon:<TeamMark team={item}/>})))]}/></div></div>{rounds.loading||fixtures.loading?<WorkspaceSkeleton/>:rounds.error?<Empty error={rounds.error} retry={rounds.reload}/>:fixtures.error?<Empty error={fixtures.error} retry={fixtures.reload}/>:<><div className="workspace-table-wrap"><table className="workspace-table fixture-schedule-table"><thead><tr><th>경기 시간</th><th>리그</th><th>경기</th><th>상태</th></tr></thead><tbody>{fixtures.data?.rows.map(row=><tr key={row.id} className="fixture-row" onClick={event=>{event.currentTarget.querySelector("button")?.focus({preventScroll:true});setMessage("");setSelectedFixture(row);}}><th scope="row"><button type="button" className="fixture-row-trigger" aria-haspopup="dialog" aria-label={`${teamName(row.home_team_id)} vs ${teamName(row.away_team_id)} 일정 정보`}>{fixtureDateLabel(row.kickoff_at)}</button>{selectedRound==="all"?<span className="fixture-round-label">{row.round==null?"라운드 미분류":`${row.round}라운드`}</span>:null}</th><td><Badge>{leagueLabel(row.league_id)}</Badge></td><td><span className="fixture-list-matchup">{fixtureTeam(row.home_team_id)}<span className="fixture-versus">vs</span>{fixtureTeam(row.away_team_id,true)}</span></td><td><FixtureStatusBadge status={row.status}/></td></tr>)}</tbody></table></div>{!fixtures.data?.rows.length?<Empty message="선택한 조건의 경기가 없어요"/>:null}<Pager total={fixtures.data?.total??0} page={page} onChange={setPage}/></>}</section>:null}
    {tab==="teams"&&clubView!=="names"&&clubPlayers.error?<Empty error={clubPlayers.error} retry={clubPlayers.reload}/>:null}
    {tab==="teams"&&clubView!=="names"?<section className="workspace-panel"><div className="workspace-toolbar"><h2>{onlyEmptyClubs?"선수단 미등록 구단":"구단 관리"} <span className="inline-count">{catalogue.data&&(!onlyEmptyClubs||clubs)?filteredTeams.length:'—'}</span></h2><div className="workspace-tools">{onlyEmptyClubs?<button type="button" className="secondary-button" onClick={()=>{setClubView("all");setQuery("");}}>전체 구단 보기</button>:null}<SearchField value={query} onChange={setQuery} placeholder="구단명 검색"/></div></div>{catalogue.loading||onlyEmptyClubs&&clubPlayers.loading?<WorkspaceSkeleton/>:catalogue.error?<Empty error={catalogue.error} retry={catalogue.reload}/>:onlyEmptyClubs&&clubPlayers.error?null:filteredTeams.length?<TeamStandings teams={filteredTeams} standings={standings} onSelect={onSelectTeam} href={team=>dataPageUrl(window.location.href,'teams',team.id)}/>:<Empty message={onlyEmptyClubs&&!query?"선수단 미등록 구단이 없어요":"조건에 맞는 구단이 없어요"}/>}</section>:null}
    {active&&tab==="teams"&&clubView==="names"&&!teamId?<ClubNameReview key={league} players={clubs?.missingNamePlayers??[]} catalogue={catalogue.data} loading={catalogue.loading||clubPlayers.loading} error={catalogue.error||clubPlayers.error} query={query} onQueryChange={setQuery} writable={writable} onSaved={clubPlayers.reload} onBack={()=>{setClubView("all");setQuery("");}} onRetry={()=>{catalogue.reload();clubPlayers.reload();}}/>:null}
    {selectedFixture?<FixtureDetailDialog key={selectedFixture.id} fixture={selectedFixture} teams={teams} stadiums={stadiums.data??[]} stadiumsAvailable={Boolean(stadiums.data)} writable={writable} onClose={()=>setSelectedFixture(null)} onSaved={()=>{setSelectedFixture(null);rounds.reload();fixtures.reload();setMessage("경기 일정을 변경했어요");}}/>:null}

    {syncDialog?<Dialog title="수동 동기화" pending={pending} onClose={()=>setSyncDialog(false)}><form className="workspace-form" noValidate onSubmit={startSync}><div className="workspace-form-field"><span>작업</span><CustomSelect label="작업" value={job} onChange={setJob} disabled={pending} options={[{value:"team-metrics",label:"팀 시즌 지표"},{value:"team-squad",label:"구단 선수단"},{value:"fixture-lineup",label:"경기 라인업"}]}/></div><div className="workspace-form-field"><span>리그</span><CustomSelect label="리그" value={syncLeague} onChange={value=>{setSyncLeague(value);setSyncTeam("");setFixtureId("");}} disabled={pending} options={leagues.slice(1)}/></div>{job==="team-squad"?<div className="workspace-form-field"><span>구단</span><CustomSelect label="구단" value={syncTeam} onChange={setSyncTeam} disabled={pending} options={[{value:"",label:"구단 선택"},...teams.filter(item=>teamLeague(standings,item.id)===syncLeague).map(item=>({value:item.id,label:item.name}))]}/></div>:job==="fixture-lineup"?<label>경기 ID<input value={fixtureId} onChange={event=>setFixtureId(event.target.value)}/></label>:null}<label>실행 사유<input name="reason" maxLength={500}/></label><p className="field-help">외부 API 사용량을 소모하며 선택한 {authEnvironment==="production"?"운영":"개발"} 환경의 데이터를 갱신합니다</p><div className="dialog-actions"><button className="primary-button" disabled={pending}>{pending?"동기화 중":"동기화 시작"}</button></div></form></Dialog>:null}
    <Feedback message={active&&!teamId?message:''}/>
    </div></div>
    {active&&tab==='sync'&&syncJobName?<AutomaticSyncDialog canRetry={writable&&authEnvironment==='production'} key={syncJobName} jobName={syncJobName} job={detailSync} loading={!automaticJobs&&cron.loading} error={detailSync?'':cron.error} health={health.data} healthError={health.error} onClose={onBackSync} onRetry={()=>{cron.reload();health.reload();}}/>:null}
    {teamId?selectedTeam?.team.id===teamId?<TeamDetailPage key={teamId} team={selectedTeam.team} league={selectedTeam.league} standing={selectedTeam.standing} writable={writable} onSaved={catalogue.reload} onPlayerSaved={clubPlayers.reload} onBack={onBack} listHref={dataPageUrl(window.location.href,'teams')}/>:<section className="workspace-panel team-detail-page" aria-label="구단 상세"><button type="button" className="club-back-button" aria-label="이전" title="이전" onClick={onBack}><ChevronLeft size={24} aria-hidden="true"/></button>{catalogue.loading?<WorkspaceSkeleton/>:catalogue.error?<Empty error={catalogue.error} retry={catalogue.reload}/>:<Empty message="구단 정보를 찾을 수 없어요"/>}</section>:null}
  </div>;
}

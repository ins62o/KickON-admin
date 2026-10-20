import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowDown,ArrowUp,ArrowUpDown,ChevronLeft} from 'lucide-react';
import {CustomSelect} from '../components/CustomSelect';
import {readTeamPlayers,saveTeamProfile} from './data';
import {dateLabel,leagueLabel,type Team,type Standing} from './model';
import {needsKoreanName,playerName,positionLabel,sortTeamPlayers,type PlayerSortKey,type TeamPlayer} from './team-detail';
import {Info,SaveButton,PlayerPhoto} from './TeamDetailUI';
import {PlayerDetailDialog} from './PlayerDetailDialog';
import {TeamMark} from './TeamMark';
import {useResource} from './useResource';
import {Badge,Empty,Feedback,Refresh,SearchField,WorkspaceSkeleton,WorkspaceTabs} from './WorkspaceUI';

const value=(entry:unknown)=>entry===null||entry===undefined||entry===''?'—':String(entry);
const columns=[['name','선수'],['shirt_number','등번호'],['position','포지션'],['appearances','출전'],['goals','득점'],['assists','도움'],['in_squad','선수단']] as const;
export function TeamDetailPage({team:initialTeam,league:initialLeague,standing,writable,onSaved,onPlayerSaved,onBack,listHref}:{team:Team;league:string|null;standing?:Standing;writable:boolean;onSaved:()=>void;onPlayerSaved:()=>void;onBack:()=>void;listHref:string}){
 const [league]=useState(initialLeague);
 const [sort,setSort]=useState<{key:PlayerSortKey;direction:'asc'|'desc'}|null>(null);
 const nextDirection=(key:PlayerSortKey)=>sort?.key===key?(sort.direction==='asc'?'desc':'asc'):['appearances','goals','assists','in_squad'].includes(key)?'desc':'asc';
 const titleRef=useRef<HTMLHeadingElement>(null),pageRef=useRef<HTMLElement>(null);
 useEffect(()=>{const opener=document.activeElement;return()=>{if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
 const [team,setTeam]=useState(initialTeam),[tab,setTab]=useState('players'),[player,setPlayer]=useState<TeamPlayer|null>(null),[editing,setEditing]=useState(false),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[query,setQuery]=useState(''),[position,setPosition]=useState('all'),[reviewOnly,setReviewOnly]=useState(false);
 useEffect(()=>{titleRef.current?.focus({preventScroll:true});window.scrollTo(0,0);},[]);
 const pageTitle=team.name;
 useEffect(()=>{const previous=document.title;document.title=`KICKON | ${pageTitle}`;return()=>{document.title=previous;};},[pageTitle]);
 const load=useCallback(()=>readTeamPlayers(team.id,league),[team.id,league]),roster=useResource(load);
 const allowed=writable&&(league==='kleague'||league==='kleague2');
 const missingNames=(roster.data??[]).filter(needsKoreanName);
 const rank=standing?.rank;
 const search=query.trim().toLocaleLowerCase(),players=(roster.data??[]).filter(row=>(!reviewOnly||needsKoreanName(row))&&(position==='all'||row.position===position)&&(!search||`${playerName(row)} ${row.player_name} ${row.shirt_number??''}`.toLocaleLowerCase().includes(search)));
 const orderedPlayers=sort?sortTeamPlayers(players,sort.key,sort.direction):players;
 const positions=[...new Set((roster.data??[]).map(row=>row.position).filter((entry):entry is string=>Boolean(entry)))];
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(pending||!allowed)return;const form=new FormData(event.currentTarget);setMessage('');setPending(true);
  try{setTeam(await saveTeamProfile(team,league!,form));onSaved();setEditing(false);setMessage('수정 내용을 저장했어요');}
  catch(error){setMessage(error instanceof Error?error.message:'저장하지 못했어요');}finally{setPending(false);}
 };
 const closePlayer=()=>{const key=player?`${player.league_id}:${player.player_id}`:'';setPlayer(null);requestAnimationFrame(()=>{const button=[...(pageRef.current?.querySelectorAll<HTMLButtonElement>('[data-player-key]')??[])].find(item=>item.dataset.playerKey===key);(button??titleRef.current)?.focus({preventScroll:true});});};
 const reset=()=>{setEditing(false);setMessage('');};
 return <section ref={pageRef} className="workspace-panel team-detail-page" aria-label="구단 상세"><header className="club-page-header"><a className="club-back-button" aria-label="이전" title="이전" href={listHref} aria-disabled={pending||undefined} onClick={event=>{if(pending){event.preventDefault();return;}if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onBack();}}><ChevronLeft size={24} aria-hidden="true"/></a><h2 ref={titleRef} tabIndex={-1}>구단 정보</h2></header>

   <div className="club-detail-heading"><TeamMark team={team}/><div><h3>{team.name}</h3><Badge>{leagueLabel(league)}</Badge></div><div className="club-current-rank"><span>현재 순위</span><strong aria-label={rank&&Number.isInteger(rank)&&rank>0?undefined:'순위 미확인'}>{rank&&Number.isInteger(rank)&&rank>0?`${rank.toLocaleString('ko-KR')}위`:'—'}</strong></div></div>
   {roster.data&&(missingNames.length>0||reviewOnly)?<div className="club-name-notice" role="status"><span><Badge tone="orange">SportsMonks 수집</Badge>한글 이름 미등록 <strong>{missingNames.length.toLocaleString('ko-KR')}명</strong></span><button type="button" className="secondary-button" aria-pressed={reviewOnly} onClick={()=>{setReviewOnly(!reviewOnly);setQuery('');setPosition('all');setTab('players');}}>{reviewOnly?'전체 선수 보기':'미등록 선수 보기'}</button></div>:null}
   <WorkspaceTabs label="구단 상세 항목" value={tab} items={[{value:'players',label:'선수 목록'},{value:'profile',label:'팀 정보'}]} onChange={next=>{if(!pending){setTab(next);reset();}}}/>
   {tab==='players'?<>
    <div className="club-roster-toolbar"><span>{roster.loading?'선수단 조회 중':roster.error?'선수단 확인 필요':`${roster.data?.length??0}명`}</span><div className="workspace-tools"><SearchField value={query} onChange={setQuery} placeholder="선수명 · 등번호 검색"/><CustomSelect label="포지션" value={position} onChange={setPosition} options={[{value:'all',label:'전체 포지션'},...positions.map(entry=>({value:entry,label:positionLabel(entry)}))]}/><Refresh onClick={roster.reload} disabled={roster.loading}/></div></div>
    {roster.loading?<WorkspaceSkeleton/>:roster.error?<Empty error={roster.error} retry={roster.reload}/>:players.length?<div className="club-roster-scroll" role="region" aria-label="선수 목록" tabIndex={0}><table className="workspace-table club-roster-table"><thead><tr>{columns.map(([key,label])=>{const active=sort?.key===key,Icon=active?(sort.direction==='asc'?ArrowUp:ArrowDown):ArrowUpDown;return <th scope="col" key={key} aria-sort={active?(sort.direction==='asc'?'ascending':'descending'):'none'}><button type="button" className="table-sort" data-active={active} aria-label={`${label} ${nextDirection(key)==='asc'?'오름차순':'내림차순'} 정렬`} onClick={()=>setSort({key,direction:nextDirection(key)})}>{label}<Icon size={14} strokeWidth={1.8} aria-hidden="true"/></button></th>;})}</tr></thead><tbody>{orderedPlayers.map(row=><tr key={`${row.league_id}:${row.player_id}`} className="club-player-row" onClick={event=>{event.currentTarget.querySelector('button')?.focus({preventScroll:true});setPlayer(row);reset();}}><th scope="row"><button type="button" className="club-player-button" aria-haspopup="dialog" data-player-key={`${row.league_id}:${row.player_id}`}><PlayerPhoto player={row}/><span className="club-player-label"><span>{playerName(row)}</span>{needsKoreanName(row)?<Badge tone="orange">한글 이름 미등록</Badge>:null}</span></button></th><td>{value(row.shirt_number)}</td><td>{positionLabel(row.position)}</td><td>{value(row.appearances)}</td><td>{value(row.goals)}</td><td>{value(row.assists)}</td><td><Badge>{row.in_squad?'등록':'제외'}</Badge></td></tr>)}</tbody></table></div>:<Empty message={reviewOnly||search||position!=='all'?'조건에 맞는 선수가 없어요':'등록된 선수 정보가 없어요'}/>}
   </>:<>
    <div className="club-profile-actions">{allowed&&!editing?<button type="button" className="primary-button" onClick={()=>setEditing(true)}>팀 정보 수정</button>:null}</div>
    {editing?<form className="workspace-form club-edit-form" noValidate onSubmit={event=>void save(event)}><div className="club-edit-grid"><label>구단 이름<input name="name" defaultValue={team.name} maxLength={120} disabled={pending}/></label><label>구단 약칭<input name="short_name" defaultValue={team.short_name} maxLength={60} disabled={pending}/></label><label>구단 코드<input name="code" defaultValue={team.code} maxLength={16} disabled={pending}/></label></div><label>변경 사유<textarea name="reason" rows={2} maxLength={1000} disabled={pending}/></label><div className="dialog-actions"><button type="button" className="secondary-button" disabled={pending} onClick={reset}>취소</button><SaveButton pending={pending}/></div></form>:<Info items={[
     ['구단 이름',team.name],['구단 약칭',team.short_name],['구단 코드',team.code],['소속 리그',leagueLabel(league)],['현재 순위',standing?.rank],['승점',standing?.points],['구단 ID',team.id],['SportsMonks 연결',team.sportmonks_id??'미연결'],['순위 갱신',dateLabel(standing?.updated_at??null,true)],
    ]}/>}
   </>}
  <Feedback message={message}/>
  {player?<PlayerDetailDialog key={`${player.league_id}:${player.player_id}`} player={player} teamName={team.name} writable={allowed} onSaved={()=>{roster.reload();onPlayerSaved();}} onClose={closePlayer}/>:null}
 </section>;
}

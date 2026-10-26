import {useEffect,useRef,useState} from 'react';
import {readTeamPlayers} from './data';
import type {ClubPlayer} from './club-summary';
import {leagueLabel,teamLeague,type Catalogue} from './model';
import {playerName,type TeamPlayer} from './team-detail';
import {PlayerDetailDialog} from './PlayerDetailDialog';
import {TeamMark} from './TeamMark';
import {Badge,Empty,Feedback,SearchField,WorkspaceSkeleton} from './WorkspaceUI';

export function ClubNameReview({players,catalogue,loading,error,query,onQueryChange,writable,onSaved,onBack,onRetry}:{players:ClubPlayer[];catalogue:Catalogue|null;loading:boolean;error:string;query:string;onQueryChange:(query:string)=>void;writable:boolean;onSaved:()=>void;onBack:()=>void;onRetry:()=>void}){
 const [selected,setSelected]=useState<TeamPlayer|null>(null),[pending,setPending]=useState<string|null>(null),[message,setMessage]=useState('');
 const request=useRef(0),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>()=>{request.current++;},[]);
 const team=(id:string)=>catalogue?.teams.find(team=>team.id===id);
 const search=query.trim().toLocaleLowerCase(),rows=players.filter(player=>!search||`${playerName(player)} ${team(player.team_id)?.name??''}`.toLocaleLowerCase().includes(search));
 const open=async(row:ClubPlayer)=>{
  if(pending)return;const id=++request.current;setPending(`${row.team_id}:${row.player_id}`);setMessage('');
  try{
   const roster=await readTeamPlayers(row.team_id,row.league_id),player=roster.find(player=>player.player_id===row.player_id);
   if(!player)throw Error('선수 정보를 찾지 못했어요 새로고침 후 다시 확인해 주세요');
   if(request.current===id)setSelected(player);
  }catch(error){if(request.current===id)setMessage(error instanceof Error?error.message:'선수 정보를 불러오지 못했어요');}finally{if(request.current===id)setPending(null);}
 };
 const close=()=>{setSelected(null);requestAnimationFrame(()=>heading.current?.focus({preventScroll:true}));};
 const selectedLeague=selected&&catalogue?teamLeague(catalogue.standings,selected.team_id):null;
 return <section className="workspace-panel club-name-review"><div className="workspace-toolbar"><h2 ref={heading} tabIndex={-1}>한글 이름 미등록 선수 <span className="inline-count">{loading||error?'—':rows.length}</span></h2><div className="workspace-tools"><SearchField value={query} onChange={onQueryChange} placeholder="선수명 · 구단명 검색"/></div><div className="workspace-actions"><button type="button" className="secondary-button" onClick={onBack}>전체 구단 보기</button></div></div>
  {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={onRetry}/>:rows.length?<div className="workspace-table-wrap"><table className="workspace-table club-name-review-table"><thead><tr><th>선수</th><th>구단</th><th>리그</th></tr></thead><tbody>{rows.map(row=><tr key={row.player_id} className="club-player-row" aria-busy={pending===`${row.team_id}:${row.player_id}`} onClick={event=>{event.currentTarget.querySelector('button')?.focus({preventScroll:true});void open(row);}}><th scope="row"><button type="button" className="club-player-button" disabled={pending!==null} aria-haspopup="dialog">{playerName(row)}{pending===`${row.team_id}:${row.player_id}`?<span className="visually-hidden">불러오는 중</span>:null}</button></th><td><span className="team-cell"><TeamMark team={team(row.team_id)}/>{team(row.team_id)?.name??row.team_id}</span></td><td><Badge>{leagueLabel(catalogue?teamLeague(catalogue.standings,row.team_id):null)}</Badge></td></tr>)}</tbody></table></div>:<Empty message={search?'조건에 맞는 선수가 없어요':'한글 이름 미등록 선수가 없어요'}/>}
  <Feedback message={message}/>
  {selected?<PlayerDetailDialog key={`${selected.team_id}:${selected.player_id}`} player={selected} teamName={team(selected.team_id)?.name??selected.team_id} writable={writable&&['kleague','kleague2'].includes(selectedLeague??'')&&selected.league_id===selectedLeague} onSaved={onSaved} onClose={close}/>:null}
 </section>;
}

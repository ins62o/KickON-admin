import {useState} from 'react';
import {ActionButton} from '@seed-design/react';
import {RefreshCw} from 'lucide-react';
import {readMarketingMatches} from './data';
import type {MarketingDraft} from './marketing-drafts';
import type {MarketingMatch} from './marketing-matchday';
import {dateLabel,leagueLabel} from './model';

export function MatchdayEditor({draft,onChange,onMessage}:{draft:MarketingDraft;onChange:(changes:Partial<MarketingDraft>)=>void;onMessage:(message:string)=>void}){
 const [loaded,setLoaded]=useState<{date:string;matches:MarketingMatch[]}>(()=>({date:draft.date,matches:draft.matchday!.matches})),[loading,setLoading]=useState(false);
 const matchday=draft.matchday!;
 const matches=loaded.date===draft.date?loaded.matches:matchday.matches;
 const load=async()=>{
  if(loading)return;
  try{
   setLoading(true);const matches=await readMarketingMatches(draft.date);
   setLoaded({date:draft.date,matches});
   onChange({matchday:{...matchday,matches:matches.slice(0,16)}});
   if(!matches.length)onMessage('해당 날짜에 안내할 경기가 없어요');
   else if(matches.length>16)onMessage('경기가 많아 앞의 16경기를 선택했어요 이미지에 넣을 경기를 조정해 주세요');
  }catch(error){onMessage(error instanceof Error?error.message:'경기를 불러오지 못했어요');}finally{setLoading(false);}
 };
 return <div className="matchday-editor">
  <div className="matchday-load"><label>경기 날짜<input type="date" value={draft.date} disabled={loading} onChange={event=>onChange({date:event.target.value,matchday:{...matchday,matches:[]}})}/></label><ActionButton variant="neutralWeak" size="small" type="button" disabled={loading||!draft.date} onClick={()=>void load()}><RefreshCw size={15} aria-hidden="true"/>{loading?'불러오는 중':'경기 불러오기'}</ActionButton></div>
  <div className="marketing-field-label"><span>포함할 경기</span><small>{matchday.matches.length}경기 선택</small></div>
  {matches.length?<div className="matchday-fixtures" aria-label="포함할 경기" aria-busy={loading}>{matches.map(match=>{
   const checked=matchday.matches.some(row=>row.id===match.id);
   return <label className="matchday-fixture" key={match.id}><input type="checkbox" checked={checked} disabled={loading||!checked&&matchday.matches.length>=16} onChange={()=>onChange({matchday:{...matchday,matches:checked?matchday.matches.filter(row=>row.id!==match.id):[...matchday.matches,match]}})}/><span><span className="matchday-fixture-teams"><img src={`/teams/official/${encodeURIComponent(match.homeTeamId)}.png`} alt=""/><b>{match.homeName} vs {match.awayName}</b><img src={`/teams/official/${encodeURIComponent(match.awayTeamId)}.png`} alt=""/></span><small>{leagueLabel(match.leagueId)} · {match.round===null?'라운드 미분류':`${match.round}R`} · {dateLabel(match.kickoffAt,true).split(' ').at(-1)}</small><small>{match.stadium}</small></span></label>;
  })}</div>:<p className="matchday-empty">날짜를 고르고 경기를 불러와 주세요</p>}
  <label>하단 문구<input value={matchday.footer} maxLength={48} onChange={event=>onChange({matchday:{...matchday,footer:event.target.value}})}/></label>
  <p className="matchday-storage-note">선택한 일정은 현재 브라우저·환경의 초안에 저장돼요</p>
 </div>;
}

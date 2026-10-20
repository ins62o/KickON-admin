import {leagues,rankTeamsByStanding,SEASON,type Team,type Standing} from './model';
import {TeamMark} from './TeamMark';

const columns=[['played','경기'],['won','승'],['drawn','무'],['lost','패'],['goals_for','득점'],['goals_against','실점'],['goal_difference','득실차'],['points','승점']] as const;
const number=(value:number|null|undefined)=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('ko-KR'):'—';
export function TeamStandings({teams,standings,onSelect,href}:{teams:Team[];standings:Standing[];onSelect:(team:Team)=>void;href:(team:Team)=>string}){
 const rows=rankTeamsByStanding(teams,standings);
 const groups=[...leagues.slice(1),{value:'unclassified',label:'리그 미분류'}].map(group=>({...group,rows:rows.filter(row=>group.value==='unclassified'?!leagues.slice(1).some(league=>league.value===row.standing?.league_id):row.standing?.league_id===group.value)})).filter(group=>group.rows.length);
 return <div className="team-standings">{groups.map(group=><section className="team-standings-group" key={group.value}>
  <h3>{group.label}<span>{group.rows.length}개 구단</span></h3>
  <div className="workspace-table-wrap team-standings-scroll" tabIndex={0} role="region" aria-label={`${group.label} 순위표`}>
   <table className="workspace-table team-standings-table">
    <caption className="visually-hidden">{SEASON} 시즌 {group.label} 구단 순위표</caption>
    <colgroup><col className="standings-rank"/><col className="standings-team"/>{columns.map(([key])=><col key={key}/>)}</colgroup>
    <thead><tr><th scope="col" className="number-cell">순위</th><th scope="col">구단</th>{columns.map(([key,label])=><th scope="col" key={key} className="number-cell">{label}</th>)}</tr></thead>
    <tbody>{group.rows.map(({team,standing})=><tr key={team.id} className="standings-team-row">
     <td className="number-cell standings-rank-value">{standing?.rank&&standing.rank>0?number(standing.rank):'—'}</td>
     <th scope="row"><a href={href(team)} className="standings-team-link" aria-label={`${team.name} 상세 보기`} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onSelect(team);}}><TeamMark team={team}/><span>{team.name}</span></a></th>
     {columns.map(([key])=><td key={key} className={`number-cell${key==='points'?' standings-points':''}`}>{number(standing?.[key])}</td>)}
    </tr>)}</tbody>
   </table>
  </div>
 </section>)}</div>;
}

import type {Team} from "./model";
// Clubs shown with their official K League emblem (public/teams/official, see sources.json) instead of the generic mark.
const officialEmblems=new Set(["ansan-greeners","jeonnam"]);
const teamMarkSource=(id:string)=>officialEmblems.has(id)?`/teams/official/${encodeURIComponent(id)}.png`:`/teams/${encodeURIComponent(id)}.webp`;
export function TeamMark({team}:{team:Pick<Team,"id"|"name"|"code">|undefined}){
  return <span className="team-mark">{team?<img src={teamMarkSource(team.id)} alt="" draggable={false} onError={event=>{event.currentTarget.hidden=true;}}/>:null}<span aria-hidden="true">{team?.code?.slice(0,3)??"—"}</span></span>;
}

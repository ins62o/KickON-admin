import type {Team} from "./model";
export function TeamMark({team}:{team:Pick<Team,"id"|"name"|"code">|undefined}){
  return <span className="team-mark">{team?<img src={`/teams/${encodeURIComponent(team.id)}.webp`} alt="" draggable={false} onError={event=>{event.currentTarget.hidden=true;}}/>:null}<span aria-hidden="true">{team?.code?.slice(0,3)??"—"}</span></span>;
}

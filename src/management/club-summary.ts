import type {SupabaseClient} from '@supabase/supabase-js';
import {SEASON,teamLeague,type Catalogue} from './model.ts';
import {needsKoreanName,type TeamPlayer} from './team-detail.ts';

export type ClubPlayer=Pick<TeamPlayer,'season'|'league_id'|'team_id'|'player_id'|'player_name'|'display_name'|'display_name_ko'|'data_source'>;
export async function readClubPlayers(client:SupabaseClient):Promise<ClubPlayer[]>{
 const rows:ClubPlayer[]=[];
 for(let from=0;;from+=500){
  const result=await client.from('team_players').select('season,league_id,team_id,player_id,player_name,display_name,display_name_ko,data_source').eq('season',SEASON).order('league_id').order('team_id').order('player_id').range(from,from+499);
  if(result.error||!Array.isArray(result.data))throw Error('선수 집계를 불러오지 못했어요 다시 시도해 주세요');
  const page=result.data as ClubPlayer[];
  if(page.some(row=>row.season!==SEASON||!row.player_id||!row.team_id||typeof row.league_id!=='string'||typeof row.player_name!=='string'||typeof row.data_source!=='string'||[row.display_name,row.display_name_ko].some(name=>name!==null&&typeof name!=='string')))throw Error('선수 집계의 시즌과 등록 정보를 확인하지 못했어요');
  rows.push(...page);if(page.length<500)break;
 }
 return rows;
}
export const clubsInLeague=(catalogue:Catalogue,league:string)=>catalogue.teams.filter(team=>league==='all'||teamLeague(catalogue.standings,team.id)===(league==='unclassified'?null:league));
export function clubSummary(catalogue:Catalogue,players:ClubPlayer[],league:string){
 const teams=clubsInLeague(catalogue,league);
 const ids=new Set(teams.map(team=>team.id)),populated=new Set<string>(),allPlayers=new Set<string>(),missingNames=new Map<string,ClubPlayer>();
 for(const player of players){
  const currentLeague=teamLeague(catalogue.standings,player.team_id);
  if(player.season!==SEASON||!ids.has(player.team_id)||currentLeague!==null&&player.league_id!==currentLeague)continue;
  populated.add(player.team_id);allPlayers.add(player.player_id);if(needsKoreanName(player)&&!missingNames.has(player.player_id))missingNames.set(player.player_id,player);
 }
 const emptyTeamIds=teams.filter(team=>!populated.has(team.id)).map(team=>team.id);
 return {teams:teams.length,players:allPlayers.size,missingNames:missingNames.size,emptyTeams:emptyTeamIds.length,emptyTeamIds,missingNamePlayers:[...missingNames.values()]};
}

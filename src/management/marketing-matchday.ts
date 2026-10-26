import type {Fixture,Stadium} from './data.ts';
import type {Team} from './model.ts';
import {stadiumName} from './fixture-schedule.ts';

export type MarketingMatch={id:string;leagueId:'kleague'|'kleague2';round:number|null;homeTeamId:string;awayTeamId:string;homeName:string;awayName:string;kickoffAt:string;stadium:string};
export type Matchday={matches:MarketingMatch[];footer:string};
export const matchdayFooter='킥온에서 직관 인증 하러가기';
export const koreanMatchDate=(value:string)=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,10);
export function matchdayMatches(fixtures:Fixture[],teams:Team[],stadiums:Stadium[]):MarketingMatch[]{
 return fixtures.filter(row=>!['CANCELLED','CANCELED','POSTPONED'].includes(row.status)).map(row=>{
  if(row.league_id!=='kleague'&&row.league_id!=='kleague2')throw Error('경기의 리그를 확인해 주세요');
  const home=teams.find(team=>team.id===row.home_team_id),away=teams.find(team=>team.id===row.away_team_id),stadium=stadiums.find(stadium=>stadium.id===row.stadium_id);
  if(!home||!away)throw Error('경기의 구단 정보를 확인해 주세요');
  if(!stadium)throw Error('경기장 연결을 확인한 뒤 다시 불러와 주세요');
  return {id:row.id,leagueId:row.league_id,round:row.round,homeTeamId:home.id,awayTeamId:away.id,homeName:home.short_name||home.name,awayName:away.short_name||away.name,kickoffAt:row.kickoff_at,stadium:stadiumName(stadium)};
 });
}
export function matchdayGroups(matches:MarketingMatch[]){
 const groups:{leagueId:MarketingMatch['leagueId'];matches:MarketingMatch[]}[]=[];
 for(const match of [...matches].sort((a,b)=>a.leagueId.localeCompare(b.leagueId)||Date.parse(a.kickoffAt)-Date.parse(b.kickoffAt)||a.id.localeCompare(b.id))){
  const group=groups.find(group=>group.leagueId===match.leagueId);
  if(group)group.matches.push(match);else groups.push({leagueId:match.leagueId,matches:[match]});
 }
 return groups;
}
export function validMatchday(value:unknown):value is Matchday{
 if(!value||typeof value!=='object')return false;
 const row=value as Record<string,unknown>;
 return typeof row.footer==='string'&&row.footer.length<=48&&Array.isArray(row.matches)&&row.matches.length<=16&&row.matches.every((match:unknown)=>{
  if(!match||typeof match!=='object')return false;
  const item=match as Record<string,unknown>;
  return ['id','homeTeamId','awayTeamId','homeName','awayName','stadium','kickoffAt'].every(key=>typeof item[key]==='string'&&item[key].trim().length>0&&item[key].length<=200)&&['kleague','kleague2'].includes(String(item.leagueId))&&(item.round===null||Number.isInteger(item.round)&&Number(item.round)>0)&&Number.isFinite(Date.parse(String(item.kickoffAt)));
 });
}

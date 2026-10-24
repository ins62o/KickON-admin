import type {SupabaseClient} from '@supabase/supabase-js';
import type {Fixture} from './data.ts';
import {SEASON} from './model.ts';

type RoundFixture=Pick<Fixture,'id'|'league_id'|'round'|'kickoff_at'|'status'>;
export type FixtureFilter='all'|'scheduled'|'today'|'live';
const scheduledStatuses=['SCHEDULED','NS'];
const liveStatuses=['LIVE','HT','INPLAY_1ST_HALF','INPLAY_2ND_HALF'];
const koreanDayStart=(now:number)=>Date.parse(`${new Date(now+9*3600000).toISOString().slice(0,10)}T00:00:00+09:00`);
export type FixtureRounds={rounds:number[];hasUnassigned:boolean;defaultRound:string;summary:{total:number;scheduled:number;today:number;live:number}};
const roundValue=(round:number|null|undefined)=>round==null?'unassigned':String(round);
function check(error:{message:string}|null){if(error)throw Error(/permission|denied|권한/i.test(error.message)?'이 정보를 조회할 권한이 없어요':'경기 일정을 불러오지 못했어요 다시 시도해 주세요');}
export async function readFixtureRounds(client:SupabaseClient,league:string,now=Date.now()):Promise<FixtureRounds>{
 if(!['all','kleague','kleague2'].includes(league))throw Error('라운드를 조회할 리그를 선택해 주세요');
 const rows:RoundFixture[]=[];
 for(let from=0;;from+=500){
  let query=client.from('fixtures').select('id,league_id,round,kickoff_at,status').gte('kickoff_at',`${SEASON}-01-01T00:00:00+09:00`).lt('kickoff_at',`${SEASON+1}-01-01T00:00:00+09:00`).order('id').range(from,from+499);
  if(league!=='all')query=query.eq('league_id',league);
  const result=await query;check(result.error);
  if(!Array.isArray(result.data))throw Error('라운드 목록을 확인하지 못했어요 다시 시도해 주세요');
  const page=result.data as RoundFixture[];if(page.some(row=>league!=='all'&&row.league_id!==league||row.round!==null&&(!Number.isInteger(row.round)||row.round<=0)))throw Error('라운드의 리그와 등록 정보를 확인하지 못했어요');rows.push(...page);if(page.length<500)break;
 }
 rows.sort((a,b)=>Date.parse(a.kickoff_at)-Date.parse(b.kickoff_at)||a.id.localeCompare(b.id));
 const scheduled=rows.filter(row=>scheduledStatuses.includes(row.status)&&Date.parse(row.kickoff_at)>=now),live=rows.filter(row=>liveStatuses.includes(row.status));
 const todayStart=koreanDayStart(now);
 const current=scheduled[0]??live[0]??rows.at(-1);
 return {rounds:[...new Set(rows.map(row=>row.round).filter((round):round is number=>round!==null))].sort((a,b)=>a-b),hasUnassigned:rows.some(row=>row.round===null),defaultRound:current?roundValue(current.round):'all',summary:{total:rows.length,scheduled:scheduled.length,today:rows.filter(row=>Date.parse(row.kickoff_at)>=todayStart&&Date.parse(row.kickoff_at)<todayStart+86400000).length,live:live.length}};
}
export async function readFixtures(client:SupabaseClient,league:string,team:string,from:string,to:string,page:number,filter:FixtureFilter='all',round='all',now=Date.now()){
 const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 if(!validDate(from)||!validDate(to)||from>to)throw Error('시작일보다 뒤의 종료일을 선택해 주세요');
 if(!Number.isInteger(page)||page<1)throw Error('조회할 페이지를 확인해 주세요');
 if(!['all','unassigned'].includes(round)&&(!/^[1-9]\d*$/.test(round)||!Number.isSafeInteger(Number(round))||Number(round)>2147483647))throw Error('조회할 라운드를 확인해 주세요');
 const end=new Date(Date.parse(to)+86400000).toISOString().slice(0,10);
 let query=client.from('fixtures').select('id,league_id,round,home_team_id,away_team_id,stadium_id,kickoff_at,status,home_score,away_score,attendance_latitude,attendance_longitude,attendance_radius_meters',{count:'exact'}).gte('kickoff_at',`${from}T00:00:00+09:00`).lt('kickoff_at',`${end}T00:00:00+09:00`).order('kickoff_at').order('id').range((page-1)*15,page*15-1);
 if(filter==='scheduled')query=query.gte('kickoff_at',new Date(now).toISOString()).in('status',scheduledStatuses);
 if(filter==='today'){const start=koreanDayStart(now);query=query.gte('kickoff_at',new Date(start).toISOString()).lt('kickoff_at',new Date(start+86400000).toISOString());}
 if(filter==='live')query=query.in('status',liveStatuses);
 if(league!=='all')query=query.eq('league_id',league);
 if(team!=='all')query=query.or(`home_team_id.eq.${team},away_team_id.eq.${team}`);
 if(round==='unassigned')query=query.is('round',null);else if(round!=='all')query=query.eq('round',Number(round));
 const result=await query;check(result.error);
 if(!Array.isArray(result.data)||result.count===null||!Number.isInteger(result.count)||result.count<0)throw Error('경기 목록과 건수를 확인하지 못했어요 다시 시도해 주세요');
 return {rows:result.data as Fixture[],total:result.count};
}
export async function readMatchdayFixtures(client:SupabaseClient,date:string){
 const fixtures:Fixture[]=[];
 for(let page=1;;page++){
  const result=await readFixtures(client,'all','all',date,date,page);
  fixtures.push(...result.rows);
  if(fixtures.length>=result.total)return fixtures;
  if(!result.rows.length)throw Error('경기 목록을 모두 불러오지 못했어요 다시 시도해 주세요');
 }
}

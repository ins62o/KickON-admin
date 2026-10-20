import type {SyncJob} from './data.ts';
import {syncTask,type CronJob} from './sync-model.ts';

export type LiveLeagueHealth={league_id:string;paused:boolean|null;lineup_targets:number;live_targets:number;postponed_targets:number;due_since:string|null;lineup_poll_at:string|null;lineup_http_status:number|null;live_poll_at:string|null;live_http_status:number|null};
export type SyncHealth={checked_at:string;jobs:CronJob[];states:SyncJob[];live:{last_attempted_at:string|null;last_succeeded_at:string|null;has_error:boolean;running:boolean;leagues:LiveLeagueHealth[]}};
export type SyncLight={tone:'green'|'red'|'gray';label:string;detail:string};
const light=(tone:SyncLight['tone'],label:string,detail:string):SyncLight=>({tone,label,detail});
const recent=(at:string|null,now:number)=>{const age=now-Date.parse(at??'');return age>=-5000&&age<=180000;};

function scheduledAt(schedule:string,now:number){
 const [minute,hour,day,month,weekday,...rest]=schedule.split(/\s+/);
 if(rest.length||day!=='*'||month!=='*'||weekday!=='*')return null;
 const matches=(part:string,value:number,max:number)=>{
  if(part==='*')return true;
  const range=/^(\d+)-(\d+)\/([1-9]\d*)$/.exec(part);
  if(range)return Number(range[1])<=value&&value<=Number(range[2])&&Number(range[2])<=max&&(value-Number(range[1]))%Number(range[3])===0;
  if(/^\*\/[1-9]\d*$/.test(part))return value%Number(part.slice(2))===0;
  return /^\d+$/.test(part)&&Number(part)<=max&&value===Number(part);
 };
 for(let at=Math.floor(now/60000)*60000;at>=now-26*3600000;at-=60000){const date=new Date(at);if(matches(minute,date.getUTCMinutes(),59)&&matches(hour,date.getUTCHours(),23))return at;}
 return null;
}
export function schedulerLight(job:CronJob,now:number):SyncLight{
 if(!job.active)return light('gray','중단됨','자동 실행이 꺼져 있어요');
 const started=Date.parse(job.last_started_at??''),due=scheduledAt(job.schedule,now-180000);
 if(!Number.isFinite(started)||started>now+5000||due===null)return light('gray','확인 불가','예약 실행 기록을 확인할 수 없어요');
 if(job.last_status!==null&&!['succeeded','running','starting','connecting','sending'].includes(job.last_status))return light('red','예약 오류','최근 예약 작업이 실패했어요');
 if(started<due)return light('red','실행 지연','예정된 예약 실행이 3분 넘게 확인되지 않았어요');
 if(job.last_status==='succeeded')return light('green','예약 정상','최근 예약 작업이 정상 종료됐어요');
 return light('gray','예약 실행 중','예약 작업의 종료 결과를 기다리고 있어요');
}
export function liveLeagueLight(league:LiveLeagueHealth,live:SyncHealth['live'],now:number):SyncLight{
 if(league.paused===null)return light('gray','확인 불가','수집 중단 설정을 확인할 수 없어요');
 if(league.paused)return light('gray','수집 중단','이 리그의 스포츠 API 수집이 중단돼 있어요');
 if(live.has_error)return light('red','수집 오류','실시간 작업이 오류를 기록했어요');
 const required:[string|null,number|null][]=[];
 if(league.lineup_targets)required.push([league.lineup_poll_at,league.lineup_http_status]);
 if(league.live_targets||league.postponed_targets)required.push([league.live_poll_at,league.live_http_status]);
 if(required.some(([at,status])=>recent(at,now)&&status!==null&&(status<200||status>=300)))return light('red','조회 오류','최근 스포츠 API 응답에 오류가 있어요');
 if(!required.length){
  if(recent(live.last_succeeded_at,now))return light('green','정상 대기','현재 조회 대상 경기가 없어요');
  if(live.running&&recent(live.last_attempted_at,now))return light('green','대상 확인 중','현재 서버에서 작업이 실행 중이에요');
  return light('red','응답 지연','최근 3분 안에 대상 확인 작업의 정상 동작이 확인되지 않았어요');
 }
 if(required.every(([at,status])=>recent(at,now)&&status!==null&&status>=200&&status<300))return light('green',league.live_targets||league.postponed_targets?'경기 조회 정상':'라인업 조회 정상','필요한 스포츠 API의 최근 3분 이내 정상 응답을 확인했어요');
 if(recent(league.due_since,now))return light('gray','조회 확인 중','조회 대상이 되어 첫 API 응답을 기다리고 있어요');
 return light('red','조회 확인 지연','조회할 경기가 있지만 최근 3분 이내 정상 API 응답을 확인하지 못했어요');
}
export function automaticSyncLight(job:CronJob,health:SyncHealth|null,error=''):SyncLight{
 if(!job.active)return light('gray','중단됨','자동 실행이 꺼져 있어요');
 if(error||!health)return light('gray',error?'상태 확인 불가':'상태 확인 중',error||'서버 실행 기록을 확인하고 있어요');
 const now=Date.parse(health.checked_at),scheduler=schedulerLight(job,now);
 if(!Number.isFinite(now))return light('gray','확인 불가','서버 기준 시각을 확인할 수 없어요');
 if(scheduler.tone!=='green')return scheduler;
 if(job.job_name==='kickon-live-football-sync'){
  const states=health.live.leagues.map(league=>liveLeagueLight(league,health.live,now));
  return states.find(state=>state.tone==='red')??states.find(state=>state.tone==='gray')??states.find(state=>state.label.includes('조회 정상'))??states[0]??light('gray','확인 불가','리그별 조회 기록이 없어요');
 }
 const task=syncTask(job.job_name).name;
 const states=health.states.filter(state=>syncTask(state.sync_key).name===task&&Date.parse(state.last_attempted_at??'')>=Date.parse(job.last_started_at??'')-120000);
 if(states.length){
  if(states.some(state=>state.last_error?.trim()))return light('red','갱신 오류','최근 데이터 처리 작업에 오류가 기록됐어요');
  if(states.every(state=>Date.parse(state.last_succeeded_at??'')>=Date.parse(state.last_attempted_at??'')))return light('green','갱신 성공','최근 데이터 처리 작업이 정상 종료됐어요');
  return light('gray','처리 확인 중','데이터 처리 작업의 종료 결과를 기다리고 있어요');
 }
 return scheduler;
}

import type {SyncJob} from './data.ts';
import {leagueLabel,type Team} from './model.ts';

export type CronJob={job_id:number;job_name:string;schedule:string;active:boolean;last_status:string|null;last_started_at:string|null;last_finished_at:string|null;last_message:string|null;failure_count_24h:number};
type SyncTask={name:string;description:string;cadenceDetail?:string;rules?:[string,string][]};
const tasks:(SyncTask&{match:RegExp})[]=[
 {match:/standings-recovery/,name:'리그 순위 복구',description:'공급자 데이터로 리그 순위와 승점을 복구해요'},
 {match:/push-outbox-recovery/,name:'푸시 발송 복구',description:'알림 생성 시 바로 시작하는 발송 작업에서 누락되거나 재시도가 필요한 건을 확인해요',rules:[
  ['일반 발송','알림이 생성되면 발송 작업을 바로 깨워요'],
  ['매분 확인','처리 대기·재시도 대상이 있을 때 발송 작업을 다시 깨워요'],
  ['발송 조건','알림 종류별 발송 모드, 사용자의 알림 설정, 유효 기한을 확인해요'],
  ['결과 범위','예약 실행 완료는 복구 확인 작업이 끝났다는 뜻이며, 기기 수신 성공을 뜻하지 않아요'],
 ]},
 {match:/attendance-reminder/,name:'직관 알림',description:'경기 시작 전 응원 구단 팬에게 직관 인증 안내 알림을 만들어요',rules:[
  ['확인 주기','5분마다 알림 대상 경기를 확인해요'],
  ['발송 시점','예정 경기의 시작 2시간 전부터 90분 전 사이에 알림을 만들어요'],
  ['대상','해당 경기 양 팀의 팬 중 가입을 완료하고 경기 알림을 켠 사용자이며, 이용 정지 계정은 제외해요'],
  ['중복 방지','사용자·경기·시작 시간 기준으로 한 번만 만들어요'],
  ['시간 변경','경기 시작 시간이 바뀌면 새 시작 시간 기준으로 다시 안내할 수 있어요'],
  ['실제 발송','푸시 알림의 직관 알림 설정과 사용자 알림 설정을 따라요'],
 ]},
 {match:/match-prediction-settlement/,name:'승부 예측 자동 정산',description:'경기 결과 수집이 끝난 미정산 경기의 승부 예측을 정산해요',rules:[
  ['확인 주기','5분마다 조건을 충족한 미정산 경기를 확인해요'],
  ['대상 조건','종료 상태이고 양 팀 스코어가 있으며, 경기 후 결과 수집이 완료된 경기예요'],
  ['처리 보류','보완 중인 득점 기록이 있거나 유효하지 않은 예측이 있으면 정산하지 않아요'],
  ['처리 범위','실행당 최대 25경기를 처리하고 이미 정산된 경기는 제외해요'],
  ['보상','적중한 승부 예측에 500P를 지급해요'],
  ['오류 처리','경기별 오류는 해당 경기 처리를 되돌리고 다음 경기로 진행해요'],
  ['결과 범위','예약 실행 완료만으로 모든 대상 경기의 정산 성공을 판단할 수 없어요'],
 ]},
 {match:/admin-resource-monitoring/,name:'서버 자원 수집',description:'서버 자원과 DB·파일 저장 용량을 수집해 서버 모니터링에 반영해요'},
 {match:/football-provider-usage-retention/,name:'스포츠 API 사용 기록 정리',description:'보관 기간이 지난 스포츠 API 호출 기록을 정리해요'},
 {match:/live/,name:'실시간 경기',description:'경기 전 라인업과 진행 중인 경기의 상태·스코어를 확인해요',rules:[
  ['라인업 조회','경기 시작 2시간 전부터 시작 전까지 매분 확인하고, 확정된 라인업과 변경 내용을 반영해요'],
  ['실시간 조회 시작','경기 시작 15분 전부터 경기 상태와 스코어를 확인해요'],
  ['경기 중 갱신','진행 중인 경기가 있으면 약 7초 간격으로 반복 조회해요'],
  ['경기가 없는 날','대상 경기를 찾는 예약 작업은 계속 실행돼요. 대상이 없으면 기본 라인업·실시간 조회는 대기하며, 연기 경기 확인이나 누락 기록 보완은 별도로 실행될 수 있어요'],
 ]},
 {match:/post-match/,name:'경기 후 데이터 갱신',description:'종료된 경기의 결과와 기록을 보완해요'},
 {match:/history/,name:'과거 데이터 초기 수집',description:'수집이 완료되지 않은 시즌의 과거 경기 데이터를 수집해요'},
 {match:/squad.*retry/,name:'선수단 재시도',description:'미완료된 선수단 수집을 다시 시도해요'},
 {match:/squad/,name:'구단 선수단',description:'구단별 선수 정보와 선수단을 갱신해요'},
 {match:/team-metrics/,name:'구단 시즌 통계',description:'구단별 시즌 통계를 갱신해요'},
 {match:/lineup/,name:'선발 라인업',description:'경기의 선발 선수와 라인업을 갱신해요'},
 {match:/goal-backfill/,name:'득점 기록 보완',description:'누락된 득점 기록을 보완해요'},
];
export const syncTask=(key:string):SyncTask=>tasks.find(task=>task.match.test(key))??{name:key,description:'등록된 자동 작업이에요'};
export function automaticSyncJobs(jobs:CronJob[]){
 const order=['실시간 경기','경기 후 데이터 갱신','과거 데이터 초기 수집','구단 선수단','선수단 재시도','구단 시즌 통계','선발 라인업'];
 const rank=(job:CronJob)=>{const index=order.indexOf(syncTask(job.job_name).name);return index<0?order.length:index;};
 return [...jobs].sort((a,b)=>rank(a)-rank(b)||a.job_name.localeCompare(b.job_name));
}
export function syncScheduleLabel(schedule:string){
 const parts=schedule.trim().split(/\s+/);if(parts.length!==5)return '사용자 지정 주기';
 const [minute,hour,day,month,weekday]=parts;
 if(day!=='*'||month!=='*'||weekday!=='*')return '사용자 지정 주기';
 if(hour==='*'&&minute==='*')return '매분';
 if(hour==='*'&&/^\*\/([1-9]\d*)$/.test(minute))return `${Number(minute.slice(2))}분마다`;
 if(hour==='*'&&/^\d+$/.test(minute)&&Number(minute)<60)return `매시간 ${minute.padStart(2,'0')}분`;
 if(!/^\d+$/.test(hour)||Number(hour)>23)return '사용자 지정 주기';
 const localHour=String((Number(hour)+9)%24).padStart(2,'0');
 if(/^\d+$/.test(minute)&&Number(minute)<60)return `매일 ${localHour}시 ${minute.padStart(2,'0')}분`;
 const range=/^(\d+)-(\d+)\/([1-9]\d*)$/.exec(minute);
 if(range&&Number(range[1])<=Number(range[2])&&Number(range[2])<60)return `매일 ${localHour}시 ${range[1].padStart(2,'0')}분 ~ ${range[2].padStart(2,'0')}분 사이 ${Number(range[3])}분마다`;
 return '사용자 지정 주기';
}
export function syncStateResult(row:Pick<SyncJob,'last_succeeded_at'|'last_error'>&Partial<Pick<SyncJob,'last_attempted_at'>>){
 if(row.last_error?.trim())return {label:'갱신 오류',tone:'orange'};
 const success=Date.parse(row.last_succeeded_at??''),attempt=Date.parse(row.last_attempted_at??'');
 return Number.isFinite(success)&&(!row.last_attempted_at||Number.isFinite(attempt)&&success>=attempt)?{label:'갱신 완료',tone:'green'}:{label:'결과 미확인',tone:'neutral'};
}
export const cronResult=(status:string|null)=>status==='succeeded'?{label:'예약 실행 완료',tone:'neutral'}:status==='running'?{label:'예약 실행 중',tone:'blue'}:status===null?{label:'기록 없음',tone:'neutral'}:{label:'예약 실행 오류',tone:'orange'};
export const syncRunResult=(status:string)=>({label:({queued:'대기',running:'진행 중',succeeded:'완료',partial:'일부 보류',failed:'실패',cancelled:'건너뜀'} as Record<string,string>)[status]??'미확인',tone:status==='succeeded'?'green':['failed','partial'].includes(status)?'orange':'neutral'});
export function syncScope(row:SyncJob,teams:Team[]=[]){
 const league=row.league_id??/(?:^|[:-])(kleague2?)(?=[:-]|$)/.exec(row.sync_key)?.[1]??null;
 const season=(row.season??Number(/(?:^|[:-])((?:19|20)\d{2})(?=[:-]|$)/.exec(row.sync_key)?.[1]??0))||null;
 const team=[...teams].sort((a,b)=>b.id.length-a.id.length).find(team=>row.sync_key.endsWith(`:${team.id}`)||row.sync_key.endsWith(`-${team.id}`)||row.sync_key.includes(`-${team.id}:`));
 return {league,season,team};
}
export const syncMessage=(message:string|null)=>message?.replace(/sbp_[a-z0-9]+/gi,'[숨김]').replace(/Bearer\s+\S+/gi,'Bearer [숨김]').replace(/(api[_-]?token|access_token|apikey)([=:]\s*)[^\s&"']+/gi,'$1$2[숨김]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[숨김]')??'—';

export function syncScopeLabel(row:SyncJob,teams:Team[]=[]){const scope=syncScope(row,teams);return [scope.season?`${scope.season} 시즌`:null,scope.league?leagueLabel(scope.league):'범위 미확인',scope.team?.name].filter(Boolean).join(' · ');}

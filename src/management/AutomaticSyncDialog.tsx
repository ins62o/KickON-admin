import type {SyncHealth,SyncLight} from './sync-health';
import {automaticSyncLight,liveLeagueLight} from './sync-health';
import {leagueLabel} from './model';
import {syncTask,syncScheduleLabel,type CronJob} from './sync-model';
import {StatusBadge} from './SyncOverview';
import {Info} from './TeamDetailUI';
import {Dialog,Empty,WorkspaceSkeleton} from './WorkspaceUI';

export function AutomaticSyncDialog({jobName,job,loading,error,health,healthError,onClose,onRetry}:{jobName:string;job:CronJob|null;loading:boolean;error:string;health:SyncHealth|null;healthError:string;onClose:()=>void;onRetry:()=>void}){
 const row=health?.jobs.find(item=>item.job_name===jobName)??job;
 const current=row?automaticSyncLight(row,health,healthError):null,isLive=jobName==='kickon-live-football-sync';
 const leagueStates=isLive&&row&&current?['kleague','kleague2'].map(id=>{
  const league=health?.live.leagues.find(item=>item.league_id===id);
  const status:SyncLight=!row.active||!health||healthError?current:league?liveLeagueLight(league,health.live,Date.parse(health.checked_at)):{tone:'gray',label:'확인 불가',detail:'리그별 조회 기록이 없어요'};
  return {id,status};
 }):[];
 const cadence:[string,unknown][]=isLive?[
  ['라인업 조회','경기 2시간 전부터 매분'],
  ['경기 상태 조회','시작 15분 전부터 확인'],
  ['경기 중 조회','약 7초 간격'],
 ]:row?[['조회 주기',syncScheduleLabel(row.schedule)]]:[];
 return <Dialog title={syncTask(jobName).name} className="sync-automatic-dialog" onClose={onClose}>
  {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={onRetry}/>:row&&current?<>
   <div className="sync-health-header"><div className="sync-health-summary" role="status"><StatusBadge status={current}/><p>{current.detail}</p></div>
    {leagueStates.length?<div className="sync-league-statuses" role="group" aria-label="리그별 상태">{leagueStates.map(({id,status})=><span key={id} className="sync-league-status"><span>{leagueLabel(id)}</span><StatusBadge status={status}/></span>)}</div>:null}
   </div>
   <Info items={[
    ['예약 활성화',row.active?'켜짐':'꺼짐'],
    ...cadence,
   ]}/>
   {healthError?<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onRetry}>다시 불러오기</button></div>:null}
  </>:<Empty message="자동 동기화 작업을 찾을 수 없어요"/>}
 </Dialog>;
}

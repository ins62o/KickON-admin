import type {SyncHealth,SyncLight} from './sync-health';
import {automaticSyncLight,liveLeagueLight} from './sync-health';
import {leagueLabel} from './model';
import {syncTask,syncScheduleLabel,type CronJob} from './sync-model';
import {StatusBadge} from './SyncOverview';
import {Info} from './TeamDetailUI';
import {Dialog,Empty,Feedback,WorkspaceSkeleton} from './WorkspaceUI';

export function AutomaticSyncDialog({jobName,job,loading,error,health,healthError,onClose,onRetry,canRetry=false}:{jobName:string;job:CronJob|null;loading:boolean;error:string;health:SyncHealth|null;healthError:string;onClose:()=>void;onRetry:()=>void;canRetry?:boolean}){
 const [pending,setPending]=useState(false),[message,setMessage]=useState('');
 const requestId=useRef<string|null>(null);
 const row=health?.jobs.find(item=>item.job_name===jobName)??job;
 const current=row?automaticSyncLight(row,health,healthError):null,isLive=jobName==='kickon-live-football-sync';
 const retry=async()=>{
  if(pending)return;setPending(true);setMessage('');requestId.current??=crypto.randomUUID();
  try{
   const session=await authClient?.auth.getSession(),token=session?.data.session?.access_token;if(!token)throw Error('로그인 상태를 다시 확인해 주세요');
   const response=await fetch(adminApiUrl('sync-retry'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({environment:authEnvironment,jobName,requestId:requestId.current})});
   const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'재시도 요청을 확인하지 못했어요');
   setMessage(result.message);onRetry();
  }catch(cause){setMessage(cause instanceof Error?cause.message:'재시도 요청을 확인하지 못했어요');}
  finally{setPending(false);}
 };
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
 return <Dialog title={syncTask(jobName).name} className="sync-automatic-dialog" pending={pending} onClose={onClose}>
  {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={onRetry}/>:row&&current?<>
   <div className="sync-health-header"><div className="sync-health-summary" role="status"><StatusBadge status={current}/><p>{current.detail}</p></div>
    {leagueStates.length?<div className="sync-league-statuses" role="group" aria-label="리그별 상태">{leagueStates.map(({id,status})=><span key={id} className="sync-league-status"><span>{leagueLabel(id)}</span><StatusBadge status={status}/></span>)}</div>:null}
   </div>
   <Info items={[
    ['예약 활성화',row.active?'켜짐':'꺼짐'],
    ...cadence,
   ]}/>
   {healthError?<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onRetry}>다시 불러오기</button></div>:null}
   {canRetry&&jobName==='kickon-post-match-football-sync'&&current.tone==='red'&&!healthError?<div className="dialog-actions"><button type="button" className="primary-button" disabled={pending} aria-busy={pending} aria-label={pending?'원인 확인 및 재시도 요청 중':'원인 재확인·재시도'} onClick={()=>void retry()}>{pending?<LoaderCircle className="login-spinner" size={18} aria-hidden="true"/>:'원인 재확인·재시도'}</button></div>:null}
   <Feedback message={message}/>
  </>:<Empty message="자동 동기화 작업을 찾을 수 없어요"/>}
 </Dialog>;
}
import {useRef,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import {adminApiUrl} from '../auth/api';
import {authClient,authEnvironment} from '../auth/client';

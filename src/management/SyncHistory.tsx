import {useCallback,useState} from 'react';
import {CustomSelect} from '../components/CustomSelect';
import {readSyncHistory} from './data';
import {useResource} from './useResource';
import {historySources,syncHistoryFamily,syncHistoryResult,syncHistoryFinishedAt,type SyncHistoryRow} from './sync-history';
import {syncTask,syncMessage,syncScopeLabel,type CronJob} from './sync-model';
import {fixtureDateLabel} from './fixture-schedule';
import type {Team} from './model';
import {Info} from './TeamDetailUI';
import {Badge,Dialog,Empty,Pager,WorkspaceSkeleton} from './WorkspaceUI';

const time=(at:string|null)=>at?fixtureDateLabel(at):'—';
function scope(row:SyncHistoryRow,teams:Team[]){
 const team=teams.find(team=>team.id===row.target_id);
 const label=syncScopeLabel({sync_key:row.job_key,season:row.season,league_id:row.league_id,last_attempted_at:row.started_at,last_succeeded_at:row.last_succeeded_at,last_error:row.message},teams);
 return row.source==='schedule'?'—':label+(team&&!label.endsWith(team.name)?` · ${team.name}`:'');
}
export function SyncHistoryPanel({active,jobs,teams,revision}:{active:boolean;jobs:CronJob[];teams:Team[];revision:number}){
 const [task,setTask]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<SyncHistoryRow|null>(null);
 if(!active&&selected)setSelected(null);
 const load=useCallback(()=>{void revision;return active?readSyncHistory(task,page):Promise.resolve(null);},[active,task,page,revision]);
 const history=useResource(load);
 const options=[{value:'',label:'전체 작업'},...Array.from(new Map(jobs.map(job=>{const family=syncHistoryFamily(job.job_name);return [family,{value:family,label:family==='squad'?'구단 선수단 · 재시도':syncTask(job.job_name).name}];})).values())];
 const result=selected?syncHistoryResult(selected):null;
 return <section className="workspace-panel sync-history-panel"><div className="workspace-toolbar"><h2>자동 동기화 실행 내역</h2><div className="workspace-tools"><span className="season-label">최근 7일</span><CustomSelect label="내역 작업" value={task} options={options} onChange={value=>{setTask(value);setPage(1);setSelected(null);}}/></div></div>
  {history.loading?<WorkspaceSkeleton/>:history.error?<Empty error={history.error} retry={history.reload}/>:history.data?<>
   {history.data.rows.length?<div className="workspace-table-wrap"><table className="workspace-table sync-history-table"><caption className="visually-hidden">자동 동기화 실행 내역</caption><thead><tr><th>작업</th><th>기록 종류</th><th>실행 시간</th><th>완료 시간</th><th>결과</th></tr></thead><tbody>{history.data.rows.map(row=>{const status=syncHistoryResult(row);return <tr key={row.id} className="sync-row" onClick={event=>{event.currentTarget.querySelector('button')?.focus({preventScroll:true});setSelected(row);}}><th scope="row"><button type="button" className="sync-row-trigger" aria-haspopup="dialog"><span className="row-title"><b>{syncTask(row.job_key).name}</b>{row.source!=='schedule'?<span>{scope(row,teams)}</span>:null}<span className="table-mobile-note">{time(row.started_at)}</span></span></button></th><td>{historySources[row.source]}</td><td>{time(row.started_at)}</td><td>{time(syncHistoryFinishedAt(row))}</td><td><Badge tone={status.tone}>{status.label}</Badge></td></tr>;})}</tbody></table></div>:<Empty message="선택한 작업의 최근 7일 기록이 없어요"/>}
   <Pager pageSize={10} page={page} total={history.data.total} onChange={setPage}/>
  </>:null}
  {active&&selected&&result?<Dialog title="자동 동기화 실행 정보" className="sync-detail-dialog" onClose={()=>setSelected(null)}><Info items={[
   ['작업',syncTask(selected.job_key).name],['기록 종류',historySources[selected.source]],['대상',scope(selected,teams)],
   ['결과',<Badge tone={result.tone}>{result.label}</Badge>],['실행 시간',time(selected.started_at)],
   ['완료 시간',time(syncHistoryFinishedAt(selected))],
   ...(selected.trigger_type?[['실행 방식',({cron:'자동 실행',retry:'재시도',manual:'수동 실행',webhook:'이벤트 실행',system:'시스템 실행'} as Record<string,string>)[selected.trigger_type]??'기록 미확인'] as [string,unknown]]:[]),
   ...(selected.counts?Object.entries(selected.counts).map(([key,value])=>[({inserted:'추가',updated:'갱신',skipped:'건너뜀',failed:'실패'} as Record<string,string>)[key],value===null?'—':`${value.toLocaleString('ko-KR')}건`] as [string,unknown]):[]),
   ['처리 내용',selected.message?syncMessage(selected.message):['failed','partial'].includes(selected.status)?'자세한 원인이 기록되지 않았어요':'별도 메시지가 기록되지 않았어요'],
  ]}/>
   {selected.source==='schedule'?<p className="field-help">예약 실행 결과예요 데이터 처리나 푸시 발송의 완료 여부는 해당 처리 기록에서 확인해 주세요</p>:selected.source==='state'?<p className="field-help">가장 최근 시도의 상태예요 이전 실행 이력과 개별 예약 실행의 연결 정보는 이 기록에 없어요</p>:<p className="field-help">실제 데이터 처리 기록이에요 개별 예약 실행과의 연결 정보는 기록되어 있지 않아요</p>}
   {selected.quarantines.length?<div className="quarantine-list"><h3>보류된 데이터</h3>{selected.quarantines.map((item,index)=><p key={index}><b>{syncMessage(item.name)}</b><span>{syncMessage(item.reason)}</span></p>)}</div>:null}
  </Dialog>:null}
 </section>;
}

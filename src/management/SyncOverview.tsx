import type {SyncJob} from './data';
import {fixtureDateLabel} from './fixture-schedule';
import {automaticSyncLight,type SyncHealth,type SyncLight} from './sync-health';
import type {Team} from './model';
import {syncMessage,syncScheduleLabel,syncScopeLabel,syncStateResult,syncTask,type CronJob} from './sync-model';
import {Info} from './TeamDetailUI';
import {Badge,Dialog} from './WorkspaceUI';

export type SyncSelection={kind:'state';job:SyncJob};
const time=(value:string|null)=>value?fixtureDateLabel(value):'—';
export function StatusBadge({status}:{status:SyncLight}){return <span className="sync-status-badge" data-tone={status.tone} title={`${status.label} · ${status.detail}`}>{status.tone==='gray'?<span aria-label={status.label}>—</span>:<Badge tone={status.tone}>{status.tone==='green'?'정상':'오류'}</Badge>}</span>;}
export function SyncStateTable({rows,teams=[],onSelect}:{rows:SyncJob[];teams?:Team[];onSelect:(selection:SyncSelection)=>void}){
 return <div className="workspace-table-wrap"><table className="workspace-table sync-state-table"><caption className="visually-hidden">데이터 갱신 상태</caption><thead><tr><th>작업</th><th>최근 시도</th><th>최근 성공</th><th>갱신 결과</th></tr></thead><tbody>{rows.map(row=>{const status=syncStateResult(row);return <tr key={row.sync_key} className="sync-row" onClick={event=>{event.currentTarget.querySelector('button')?.focus({preventScroll:true});onSelect({kind:'state',job:row});}}><th scope="row"><button type="button" className="sync-row-trigger" aria-haspopup="dialog" aria-label={`${syncTask(row.sync_key).name} ${syncScopeLabel(row,teams)} 갱신 정보`}><span className="row-title"><b>{syncTask(row.sync_key).name}</b><span>{syncScopeLabel(row,teams)}</span></span></button></th><td>{time(row.last_attempted_at)}</td><td>{time(row.last_succeeded_at)}</td><td><Badge tone={status.tone}>{status.label}</Badge></td></tr>;})}</tbody></table></div>;
}
export function AutomaticSyncTable({rows,onSelect,health=null,healthError=''}:{rows:CronJob[];onSelect:(job:CronJob)=>void;health?:SyncHealth|null;healthError?:string}){
 return <div className="workspace-table-wrap"><table className="workspace-table automatic-sync-table"><caption className="visually-hidden">자동 동기화</caption><thead><tr><th>작업</th><th>예약 주기</th><th>현재 상태</th><th>최근 예약 실행</th></tr></thead><tbody>{rows.map(row=>{const task=syncTask(row.job_name),current=automaticSyncLight(row,health,healthError),isLive=row.job_name==='kickon-live-football-sync';return <tr key={row.job_id} className="sync-row" onClick={event=>{event.currentTarget.querySelector('button')?.focus({preventScroll:true});onSelect(row);}}><th scope="row"><button type="button" className="sync-row-trigger" aria-haspopup="dialog" aria-label={`${task.name} 자동 동기화 정보`}><span>{task.name}</span><span className="table-mobile-note">{syncScheduleLabel(row.schedule)}{isLive?" · 약 7초마다":""}</span></button></th><td><span className="sync-schedule-tags"><Badge>{syncScheduleLabel(row.schedule)}</Badge>{isLive&&<Badge>약 7초마다</Badge>}</span>{!isLive&&task.cadenceDetail&&<span className="sync-cell-note">{task.cadenceDetail}</span>}</td><td><StatusBadge status={current}/></td><td>{time(row.last_started_at)}</td></tr>;})}</tbody></table></div>;
}
export function SyncDetailDialog({selection,teams=[],onClose}:{selection:SyncSelection;teams?:Team[];onClose:()=>void}){
 const row=selection.job,status=syncStateResult(row);
 return <Dialog title="데이터 갱신 정보" className="sync-detail-dialog" onClose={onClose}><Info items={[
  ['작업',syncTask(row.sync_key).name],['대상',syncScopeLabel(row,teams)],['갱신 결과',<Badge tone={status.tone}>{status.label}</Badge>],['최근 시도',time(row.last_attempted_at)],['최근 성공',time(row.last_succeeded_at)],['확인할 내용',syncMessage(row.last_error)],['작업 식별자',row.sync_key],
 ]}/></Dialog>;
}

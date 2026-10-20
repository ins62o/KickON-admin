import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft} from 'lucide-react';
import {readPushRecipients} from './data';
import {isPushResultFilter,isPushPhaseFilter,pushMatchPhases,pushKinds,pushRecipientStatus,pushSettingStatus,type PushRecipient,type PushKind,type PushResultFilter,type PushPhaseFilter} from './push-model';
import type {PushSettings} from './push-settings';
import {useResource} from './useResource';
import {Badge,Empty,Pager,Refresh,SearchField,WorkspaceSkeleton,WorkspaceTabs} from './WorkspaceUI';
import {Info} from './TeamDetailUI';
import {TeamMark} from './TeamMark';
import {fixtureDateLabel} from './fixture-schedule';
import {PushDeliveryDialog} from './PushDeliveryDialog';
import {CustomSelect} from '../components/CustomSelect';

export function PushDetailPage({kind,settings,settingsLoading,settingsError,onSettingsRetry,onBack,listHref}:{kind:PushKind;settings:PushSettings|null;settingsLoading:boolean;settingsError:string;onSettingsRetry:()=>void;onBack:()=>void;listHref:string}){
 const info=pushKinds.find(row=>row.key===kind)!,current=pushSettingStatus(settings,info.type);
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<PushRecipient|null>(null);
 const [result,setResult]=useState<PushResultFilter>('all'),[phase,setPhase]=useState<PushPhaseFilter>('all');
 const loader=useCallback(()=>readPushRecipients(kind,query,page,result,phase).then(data=>({...data,page})),[kind,query,page,result,phase]);
 const recipients=useResource(loader,true),title=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{window.scrollTo(0,0);title.current?.focus({preventScroll:true});},[]);
 const refresh=()=>{onSettingsRetry();recipients.reload();};
 return <div className="data-tools-content push-detail-page" role="region" aria-label={`${info.name} 상세`}>
  <header className="workspace-toolbar standalone data-section-heading"><div className="push-detail-heading"><a className="club-back-button" href={listHref} aria-label="이전" title="이전" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onBack();}}><ChevronLeft size={24} aria-hidden="true"/></a><h2 ref={title} tabIndex={-1}>{info.name}</h2></div><div className="workspace-tools"><Refresh disabled={settingsLoading||recipients.loading} onClick={refresh}/></div></header>
  <section className="workspace-panel"><div className="workspace-toolbar"><h2>알림 정보</h2></div>{settingsLoading?<WorkspaceSkeleton/>:settingsError?<Empty error={settingsError} retry={onSettingsRetry}/>:settings?<div className="push-detail-info"><Info items={[
   ['현재 설정',<Badge tone={current.tone}>{current.label}</Badge>],['알림 설명',info.description],['발송 조건',kind==='match'?<span className="push-phase-badges">{pushMatchPhases.map(phase=><Badge key={phase.value} tone="neutral">{phase.label}</Badge>)}</span>:info.when],['발송 대상',info.audience],['전체 발송 차단',settings.global_disabled?'사용 중':'해제'],['최대 발송 시도',`${settings.max_attempts}회`],['기본 재시도 대기',`${settings.base_retry_delay_seconds}~${settings.max_retry_delay_seconds}초`],
  ]}/></div>:null}</section>
  <section className="workspace-panel push-recipient-panel"><div className="workspace-toolbar"><h2>대상 사용자 및 발송 내역</h2><div className="workspace-tools"><CustomSelect label="발송 결과" value={result} options={[{value:"all",label:"전체"},{value:"success",label:"성공"},{value:"failure",label:"실패"}]} onChange={value=>{if(isPushResultFilter(value)){setResult(value);setPage(1);}}}/><SearchField value={query} onChange={value=>{setQuery(value.slice(0,100));setPage(1);}} placeholder="닉네임 · 사용자 ID 검색"/></div></div>
   <div className="push-phase-filters">{kind==='match'?<WorkspaceTabs label="경기 상태" value={phase} items={[{value:'all',label:'전체'},...pushMatchPhases]} onChange={value=>{if(isPushPhaseFilter(value)){setPhase(value);setPage(1);}}}/>:null}<span className="push-recipient-count" aria-busy={recipients.loading}>{recipients.data?`${recipients.data.total.toLocaleString('ko-KR')}건`:'—'}</span></div>
   {recipients.loading&&!recipients.data?<WorkspaceSkeleton/>:recipients.error?<Empty error={recipients.error} retry={recipients.reload}/>:recipients.data?<div aria-busy={recipients.loading}>
    {recipients.data.rows.length?<div className="workspace-table-wrap"><table className="workspace-table push-recipient-table"><thead><tr><th>사용자</th><th>알림</th><th>최근 발송 시도</th><th>발송 결과</th></tr></thead><tbody>{recipients.data.rows.map(row=>{const status=pushRecipientStatus(row);return <tr key={row.id} className="sync-row" onClick={event=>{if((event.target as HTMLElement).closest('button'))return;event.currentTarget.querySelector('button')?.click();}}><th scope="row"><button type="button" className="sync-row-trigger" disabled={recipients.loading} aria-label={`${row.nickname||'닉네임 없음'} 발송 상세 보기`} onClick={()=>setSelected(row)}><span className="push-recipient-user"><TeamMark team={row.team??undefined}/><b title={row.nickname??undefined}>{row.nickname||'닉네임 없음'}</b></span></button></th><td className="push-recipient-content">{kind==='match'&&pushMatchPhases.some(phase=>phase.value===row.phase)?<Badge tone="neutral">{pushMatchPhases.find(phase=>phase.value===row.phase)!.label}</Badge>:<b>{row.title??'알림 원문 없음'}</b>}</td><td><span className="push-recipient-meta">{row.last_attempted_at?fixtureDateLabel(row.last_attempted_at):'—'}<small>대상 생성 {fixtureDateLabel(row.created_at)}</small></span></td><td><Badge tone={status.tone}>{status.label}</Badge></td></tr>;})}</tbody></table></div>:<Empty message={query||result!=='all'||phase!=='all'?'조건에 맞는 발송 내역이 없어요':'이 알림의 발송 내역이 없어요'}/>}
    <Pager showTotal={false} disabled={recipients.loading} pageSize={10} page={recipients.data.page} total={recipients.data.total} onChange={setPage}/>
   </div>:null}
  </section>
  {selected?<PushDeliveryDialog key={selected.id} recipient={selected} onClose={()=>setSelected(null)}/>:null}
 </div>;
}

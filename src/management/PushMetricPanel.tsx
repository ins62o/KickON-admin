import {useCallback,useState} from 'react';
import {readPushEnabledUsers,readPushMetricRecipients} from './data';
import type {PushEnabledUser,PushMetric,PushMetricRecipient,PushFailureReason} from './push-settings';
import {pushKinds,pushMatchPhases,pushRecipientStatus,pushFailureSummary,pushEvidenceTime,pushDeliveryMetrics,pushFailureReasons} from './push-model';
import {useResource} from './useResource';
import {Badge,Empty,Pager,Refresh,SearchField,WorkspaceSkeleton} from './WorkspaceUI';
import {TeamMark} from './TeamMark';
import {fixtureDateLabel} from './fixture-schedule';
import {PushDeliveryDialog} from './PushDeliveryDialog';
import {CustomSelect} from '../components/CustomSelect';

const titles:Record<PushMetric,string>={enabled:'푸시 알림 ON 사용자',...Object.fromEntries(pushDeliveryMetrics.map(m=>[m.key,m.title]))} as Record<PushMetric,string>;
function Preference({value}:{value:boolean|null}){return <Badge tone={value===true?'green':'neutral'}>{value===true?'ON':value===false?'OFF':'확인 불가'}</Badge>;}
function EnabledUsersTable({rows}:{rows:PushEnabledUser[]}){
 return <div className="workspace-table-wrap"><table className="workspace-table push-enabled-users-table"><caption className="visually-hidden">사용자별 알림 설정</caption><thead><tr><th>사용자</th><th>라인업 등록 알림</th><th>경기 알림</th><th>커뮤니티 알림</th><th className="mobile-table-cell">알림 설정</th></tr></thead><tbody>{rows.map(row=>{
  const match=row.match_enabled!==null&&row.goal_enabled!==null&&row.match_enabled!==row.goal_enabled?<Badge tone="orange">부분 설정</Badge>:<Preference value={row.match_enabled===null||row.goal_enabled===null?null:row.match_enabled&&row.goal_enabled}/>;
  return <tr key={row.user_id}><th scope="row"><span className="push-recipient-user"><TeamMark team={row.team??undefined}/><b>{row.nickname||'닉네임 없음'}</b></span></th><td><Preference value={row.lineup_enabled}/></td><td>{match}</td><td><Preference value={row.community_enabled}/></td><td className="mobile-table-cell"><div className="mobile-preferences"><div><span>라인업</span><Preference value={row.lineup_enabled}/></div><div><span>경기</span>{match}</div><div><span>커뮤니티</span><Preference value={row.community_enabled}/></div></div></td></tr>;
 })}</tbody></table></div>;
}
function DeliveriesTable({rows,metric,onSelect,disabled}:{rows:PushMetricRecipient[];metric:Exclude<PushMetric,'enabled'>;onSelect:(row:PushMetricRecipient)=>void;disabled:boolean}){
 return <div className="workspace-table-wrap"><table className={`workspace-table push-recipient-table push-metric-deliveries${metric==='failure'?' push-metric-failures':''}`}><caption className="visually-hidden">집계에 포함된 발송 내역</caption><thead><tr><th>사용자</th><th>알림</th><th>{metric==='success'?'접수 성공':metric==='pending'?'최근 처리':'처리 종료'}</th><th>{metric==='failure'?'실패 사유':'발송 결과'}</th></tr></thead><tbody>{rows.map(row=>{
  const status=pushRecipientStatus(row);
  const category=pushKinds.find(kind=>kind.key===row.kind)!,phase=pushMatchPhases.find(phase=>phase.value===row.phase);
  return <tr key={row.id} className="sync-row" onClick={event=>{if((event.target as HTMLElement).closest('button'))return;const trigger=event.currentTarget.querySelector('button');trigger?.focus({preventScroll:true});trigger?.click();}}><th scope="row"><button type="button" className="sync-row-trigger" disabled={disabled} aria-label={`${row.nickname||'닉네임 없음'} 발송 상세 보기`} onClick={()=>onSelect(row)}><span className="push-recipient-user"><TeamMark team={row.team??undefined}/><b>{row.nickname||'닉네임 없음'}</b></span></button></th><td><span className="row-title"><span><Badge>{phase?.label??category.name}</Badge></span><b>{row.title??'알림 원문 없음'}</b></span></td><td>{row.metric_at?fixtureDateLabel(row.metric_at):'기록 없음'}</td><td><Badge tone={status.tone}>{status.label}</Badge>{metric==='failure'?<div className="push-failure-explanation"><p>{pushFailureSummary(row)}</p>{row.failure_reasons.length?<code>{row.failure_reasons.map(reason=>reason.code).join(' · ')}</code>:null}{row.delivery_outcome==='expired'?<span>유효 시각 {row.expires_at?pushEvidenceTime(row.expires_at):'기록 없음'}</span>:null}{row.completed_at?<span>처리 종료 {pushEvidenceTime(row.completed_at)}</span>:null}{row.delivery_outcome==='no_target'&&row.targets_materialized_at?<span>기기 선정 {pushEvidenceTime(row.targets_materialized_at)}</span>:null}</div>:null}</td></tr>;
 })}</tbody></table></div>;
}
export function PushMetricPanel({metric,refreshKey}:{metric:PushMetric;refreshKey:number}){
 const [reason,setReason]=useState<PushFailureReason>('all');
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[selected,setSelected]=useState<PushMetricRecipient|null>(null);
 const loader=useCallback(async()=>{
  const result=metric==='enabled'?{kind:'enabled' as const,...await readPushEnabledUsers(query,page)}:{kind:'deliveries' as const,...await readPushMetricRecipients(metric,query,page,reason)};
  return {...result,page,refreshKey};
 },[metric,query,page,reason,refreshKey]);
 const resource=useResource(loader,true),data=resource.data;
 return <section className="workspace-panel push-metric-panel" aria-label={titles[metric]}>
  <div className="workspace-toolbar"><h2>{titles[metric]} <span className="inline-count" aria-busy={resource.loading}>{data?`${data.total.toLocaleString('ko-KR')}${metric==='enabled'?'명':'건'}`:'—'}</span></h2><div className="workspace-tools">{metric==='failure'?<CustomSelect label="실패 사유" value={reason} options={[...pushFailureReasons]} onChange={value=>{if(pushFailureReasons.some(option=>option.value===value)){setReason(value as PushFailureReason);setPage(1);}}}/>:null}<SearchField value={query} onChange={value=>{setQuery(value.slice(0,100));setPage(1);}} placeholder="닉네임 · 사용자 ID 검색"/></div><div className="workspace-actions"><Refresh disabled={resource.loading} onClick={resource.reload}/></div></div>
  {resource.loading&&!data?<WorkspaceSkeleton/>:resource.error?<Empty error={resource.error} retry={resource.reload}/>:data?<div aria-busy={resource.loading}>
   {data.rows.length?data.kind==='enabled'?<EnabledUsersTable rows={data.rows}/>:<DeliveriesTable rows={data.rows} metric={metric as Exclude<PushMetric,'enabled'>} onSelect={setSelected} disabled={resource.loading}/>:<Empty message={query?'검색 결과가 없어요':metric==='failure'&&reason!=='all'?'선택한 사유의 실패 내역이 없어요':metric==='enabled'?'알림을 켠 사용자가 없어요':pushDeliveryMetrics.find(m=>m.key===metric)?.empty??'발송 내역이 없어요'}/>}
   <Pager showTotal={false} disabled={resource.loading} pageSize={10} page={data.page} total={data.total} onChange={setPage}/>
  </div>:null}
  {selected?<PushDeliveryDialog key={selected.id} recipient={selected} onClose={()=>setSelected(null)}/>:null}
 </section>;
}

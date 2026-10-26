import {useState,type FormEvent} from 'react';
import {ActionButton} from '@seed-design/react';
import type {AdminIdentity} from '../auth/policy';
import type {AppRelease} from './app-releases';
import {readAppReleases,readAppReleaseHistory,saveAppRelease} from './data';
import {useResource} from './useResource';
import {dateLabel} from './model';
import {Badge,Empty,Feedback,Pager,Refresh,WorkspaceSkeleton} from './WorkspaceUI';

const platforms=[{value:'android',label:'Android',store:'Google Play'},{value:'ios',label:'iPhone',store:'App Store'}] as const;
const summary=(release:AppRelease|null)=>release?`${release.version} · ${release.enabled?'안내 켜짐':'안내 꺼짐'}`:'미등록';

function ReleaseForm({platform,release,canEdit,refreshing,onSaved,onMessage}:{platform:typeof platforms[number];release?:AppRelease;canEdit:boolean;refreshing:boolean;onSaved:()=>void;onMessage:(message:string)=>void}){
  const [version,setVersion]=useState(release?.version??''),[enabled,setEnabled]=useState(release?.enabled??false),[pending,setPending]=useState(false);
  const changed=version.trim()!==(release?.version??'')||enabled!==(release?.enabled??false);
  const disabled=!canEdit||pending||refreshing;
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(disabled||!changed)return;
    setPending(true);onMessage('');
    try{await saveAppRelease(platform.value,version,enabled);onMessage(`${platform.label} 업데이트 설정을 저장했어요`);onSaved();}
    catch(error){onMessage(error instanceof Error?error.message:'앱 업데이트 설정을 저장하지 못했어요');}
    finally{setPending(false);}
  }
  return <form className="workspace-form app-release-form" aria-label={`${platform.label} 업데이트 설정`} noValidate onSubmit={submit} aria-busy={pending}>
    <div className="app-release-card-heading"><div><h3>{platform.label}</h3><span>{platform.store}</span></div><Badge tone={release?.enabled?'green':'neutral'}>{!release?'미등록':release.enabled?'안내 중':'안내 꺼짐'}</Badge></div>
    <label>출시 버전<input value={version} onChange={event=>setVersion(event.target.value)} placeholder="예: 1.0.3" maxLength={40} autoComplete="off" spellCheck={false} disabled={disabled}/></label>
    <label className="app-release-toggle"><span>업데이트 안내</span><input type="checkbox" checked={enabled} disabled={disabled} onChange={event=>setEnabled(event.target.checked)}/></label>
    {release?<p className="app-release-updated">최근 저장 <time dateTime={release.updated_at}>{dateLabel(release.updated_at,true)}</time></p>:<p className="app-release-updated">등록된 출시 버전이 없어요</p>}
    {canEdit?<div className="app-release-actions"><ActionButton variant="neutralWeak" size="small" type="button" disabled={disabled||!changed} onClick={()=>{setVersion(release?.version??'');setEnabled(release?.enabled??false);}}>변경 취소</ActionButton><ActionButton variant="brandSolid" size="small" type="submit" disabled={disabled||!changed} loading={pending}>저장</ActionButton></div>:null}
  </form>;
}

function ReleaseHistory(){
  const history=useResource(readAppReleaseHistory),[page,setPage]=useState(1);
  if(history.loading)return <WorkspaceSkeleton/>;
  if(history.error)return <Empty error={history.error} retry={history.reload}/>;
  if(!history.data?.length)return <Empty message="아직 변경 이력이 없어요"/>;
  return <><div className="workspace-table-wrap"><table className="workspace-table app-release-history" aria-label="앱 업데이트 변경 이력">
    <thead><tr><th>플랫폼</th><th className="app-release-before">변경 전</th><th>변경 후</th><th className="app-release-date">변경일</th></tr></thead>
    <tbody>{history.data.slice((page-1)*5,page*5).map(row=><tr key={row.id}>
      <th scope="row"><span>{row.entity_id==='android'?'Android':'iPhone'}</span><time className="table-mobile-note" dateTime={row.created_at}>{dateLabel(row.created_at,true)}</time></th>
      <td className="app-release-before">{summary(row.before_value)}</td><td>{summary(row.after_value)}<span className="table-mobile-note">이전 {summary(row.before_value)}</span></td>
      <td className="app-release-date"><time dateTime={row.created_at}>{dateLabel(row.created_at,true)}</time></td>
    </tr>)}</tbody>
  </table></div><Pager page={page} total={history.data.length} pageSize={5} onChange={setPage}/></>;
}

export function AppReleaseManager({admin}:{admin:AdminIdentity}){
  const releases=useResource(readAppReleases,true),[message,setMessage]=useState(''),[revision,setRevision]=useState(0),[historyOpen,setHistoryOpen]=useState(false);
  const canEdit=admin.role==='admin'||admin.role==='super_admin';
  const reload=()=>{releases.reload();setRevision(value=>value+1);};
  return <section className="workspace-panel app-release-panel"><div className="workspace-toolbar app-release-heading"><h2>앱 업데이트</h2><Refresh onClick={reload} disabled={releases.loading}/></div>
    {releases.loading&&!releases.data?<WorkspaceSkeleton/>:releases.error?<Empty error={releases.error} retry={reload}/>:<>
      {!canEdit?<p className="app-release-readonly">설정 변경은 관리자와 최고 관리자만 할 수 있어요</p>:null}
      <div className="app-release-grid">{platforms.map(platform=>{const release=releases.data?.find(row=>row.platform===platform.value);return <ReleaseForm key={`${platform.value}:${release?.updated_at}:${release?.version}:${release?.enabled}`} platform={platform} release={release} canEdit={canEdit} refreshing={releases.loading} onSaved={reload} onMessage={setMessage}/>;})}</div>
    </>}
    <details className="app-release-history-section" onToggle={event=>setHistoryOpen(event.currentTarget.open)}><summary>최근 변경 이력</summary>{historyOpen?<ReleaseHistory key={revision}/>:null}</details>
    <Feedback message={message}/>
  </section>;
}

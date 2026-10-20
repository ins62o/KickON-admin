import {useState} from 'react';
import {PushMetricPanel} from './PushMetricPanel';
import type {PushMetric} from './push-settings';
import {readPushSettings,readPushOverview} from './data';
import {PushSettingsPanel} from './PushSettingsPanel';
import {useResource} from './useResource';
import {Badge,Empty,Refresh,Stat} from './WorkspaceUI';
import {PushDetailPage} from './PushDetailPage';
import type {PushKind} from './push-model';

export function PushWorkspace({kind,onSelect,onBack,listHref,href,active=true}:{active?:boolean;kind:PushKind|null;onSelect:(kind:PushKind)=>void;onBack:()=>void;listHref:string;href:(kind:PushKind)=>string}){
 const settings=useResource(readPushSettings),overview=useResource(readPushOverview);
 const [selectedMetric,setSelectedMetric]=useState<PushMetric|null>(null),[refreshKey,setRefreshKey]=useState(0);
 const selectMetric=(metric:PushMetric)=>setSelectedMetric(current=>current===metric?null:metric);
 const refresh=()=>{settings.reload();overview.reload();setRefreshKey(value=>value+1);};
 if(kind)return <PushDetailPage key={kind} kind={kind} settings={settings.data} settingsLoading={settings.loading} settingsError={settings.error} onSettingsRetry={settings.reload} onBack={onBack} listHref={listHref}/>;
 return <div className="data-tools-content"><div className="workspace-toolbar standalone data-section-heading"><h2>푸시 알림</h2><div className="workspace-tools"><Refresh disabled={settings.loading||overview.loading} onClick={refresh}/></div></div>
  <div className="workspace-stats push-overview">
   <Stat onClick={()=>selectMetric('enabled')} pressed={selectedMetric==='enabled'} disabled={overview.loading||!overview.data} label="푸시 알림 ON" value={overview.data?.enabled_users??null} loading={overview.loading} unit="명">{overview.data?.unknown_users?<span className="push-overview-note"><Badge tone="neutral">설정 미확인 {overview.data.unknown_users.toLocaleString('ko-KR')}명</Badge></span>:null}</Stat>
   <Stat onClick={()=>selectMetric('success')} pressed={selectedMetric==='success'} disabled={overview.loading||!overview.data} label="오늘 발송 성공" value={overview.data?.today_succeeded??null} loading={overview.loading} unit="건"/>
   <Stat onClick={()=>selectMetric('failure')} pressed={selectedMetric==='failure'} disabled={overview.loading||!overview.data} label="오늘 발송 실패" value={overview.data?.today_failed??null} loading={overview.loading} unit="건"/>
   <Stat onClick={()=>selectMetric('pending')} pressed={selectedMetric==='pending'} disabled={overview.loading||!overview.data} label="발송 대기" value={overview.data?.pending??null} loading={overview.loading} unit="건"/>
  </div>
  {overview.error?<Empty error={overview.error} retry={overview.reload}/>:null}
  {selectedMetric&&active?<PushMetricPanel key={selectedMetric} metric={selectedMetric} refreshKey={refreshKey}/>:null}
  <PushSettingsPanel overview={overview.data} overviewLoading={overview.loading} data={settings.data} loading={settings.loading} error={settings.error} onRetry={settings.reload} onSelect={onSelect} href={href}/></div>;
}

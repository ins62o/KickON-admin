import {useState} from 'react';
import {PushMetricPanel} from './PushMetricPanel';
import type {PushMetric} from './push-settings';
import {readPushSettings,readPushOverview} from './data';
import {PushSettingsPanel} from './PushSettingsPanel';
import {useResource} from './useResource';
import {Badge,Empty,Refresh,Stat} from './WorkspaceUI';
import {PushDetailPage} from './PushDetailPage';
import {pushDeliveryMetrics,pushDeliveryCounts,type PushKind} from './push-model';

export function PushWorkspace({kind,onSelect,onBack,listHref,href,active=true}:{active?:boolean;kind:PushKind|null;onSelect:(kind:PushKind)=>void;onBack:()=>void;listHref:string;href:(kind:PushKind)=>string}){
 const settings=useResource(readPushSettings),overview=useResource(readPushOverview);
 const [selectedMetric,setSelectedMetric]=useState<PushMetric|null>(null),[refreshKey,setRefreshKey]=useState(0);
 const deliveryCounts=overview.data?pushDeliveryCounts(overview.data):null;
 const selectMetric=(metric:PushMetric)=>setSelectedMetric(current=>current===metric?null:metric);
 const refresh=()=>{settings.reload();overview.reload();setRefreshKey(value=>value+1);};
 if(kind)return <PushDetailPage key={kind} kind={kind} settings={settings.data} settingsLoading={settings.loading} settingsError={settings.error} onSettingsRetry={settings.reload} onBack={onBack} listHref={listHref}/>;
 return <div className="data-tools-content"><div className="workspace-toolbar standalone data-section-heading"><h2>푸시 알림</h2><div className="workspace-actions"><Refresh disabled={settings.loading||overview.loading} onClick={refresh}/></div></div>
  <div className="workspace-stats push-overview">
   <Stat onClick={()=>selectMetric('enabled')} pressed={selectedMetric==='enabled'} disabled={overview.loading||!overview.data} label="푸시 알림 ON" value={overview.data?.enabled_users??null} loading={overview.loading} unit="명">{overview.data?.unknown_users?<span className="push-overview-note"><Badge tone="neutral">설정 미확인 {overview.data.unknown_users.toLocaleString('ko-KR')}명</Badge></span>:null}</Stat>
   <Stat label="오늘 처리 · 전체 대기" value={deliveryCounts?.total??null} loading={overview.loading} unit="건"/>
   {pushDeliveryMetrics.map(metric=><Stat key={metric.key} onClick={()=>selectMetric(metric.key)} pressed={selectedMetric===metric.key} disabled={overview.loading||!deliveryCounts} label={metric.title} value={deliveryCounts?.[metric.key]??null} loading={overview.loading} unit="건"/>)}
  </div>
  <p className="system-note push-overview-scope">오늘 처리 건수는 한국 시간 기준이에요 · 발송 대기는 날짜와 관계없이 남은 건수예요 · 성공은 푸시 서버 접수 기준이에요</p>
  {overview.error?<Empty error={overview.error} retry={overview.reload}/>:null}
  {selectedMetric&&active?<PushMetricPanel key={selectedMetric} metric={selectedMetric} refreshKey={refreshKey}/>:null}
  <PushSettingsPanel overview={overview.data} overviewLoading={overview.loading} data={settings.data} loading={settings.loading} error={settings.error} onRetry={settings.reload} onSelect={onSelect} href={href}/></div>;
}

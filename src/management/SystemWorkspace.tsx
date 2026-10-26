import {adminApiUrl} from '../auth/api.ts';
import {useCallback,useEffect,useId,useMemo,useState,type PointerEvent} from 'react';
import {authClient,authEnvironment} from '../auth/client';
import {dateLabel} from './model';
import type {MonitoringResponse,ResourceUsage,SystemSample,HealthStatus} from './system-health';
import {Badge,Empty,Refresh,WorkspaceSkeleton} from './WorkspaceUI';
import {buildResourceChart,resourceChartPoint,resourceChartSize,resourceChartY} from './resource-chart';
import {resourceRanges,isResourceRange,type ResourceRange} from './system-health';
import {CustomSelect} from '../components/CustomSelect';
import {Toast} from '../components/Toast';
import {DatabaseRestartControl} from './DatabaseRestartControl';
import {BillingUsage} from './BillingUsage';
const statuses:Record<HealthStatus,string>={healthy:'정상',warning:'주의',critical:'위험',unknown:'확인 필요',unreachable:'연결 실패'};
const cpuIssues={initial:'첫 측정 · 다음 수집에서 계산',missing:'CPU 지표 확인 필요',no_change:'CPU 지표 갱신 대기',counter_reset:'CPU 카운터 재수집',cores_changed:'CPU 구성 변경 · 재수집',restarted:'서버 재시작 후 재수집'};
const bytes=(value:number|null|undefined)=>value===null||value===undefined?'—':value>=1024**3?`${(value/1024**3).toFixed(2)} GiB`:`${(value/1024**2).toFixed(1)} MiB`;
const percent=(value:number|null|undefined)=>value===null||value===undefined?'—':`${value.toLocaleString('ko-KR',{maximumFractionDigits:1})}%`;
function tone(status:HealthStatus){return status==='healthy'?'green':status==='warning'?'orange':status==='critical'||status==='unreachable'?'red':'neutral';}
function ResourceCard({label,value,usage,note}:{label:string;value:number|null;usage?:ResourceUsage|null;note?:string}){
 return <article className="system-resource"><h3>{label}</h3><strong>{percent(value)}</strong>{usage?<small>{label==='DB 연결'?`${usage.used.toLocaleString('ko-KR')} / ${usage.total.toLocaleString('ko-KR')}개`:`${bytes(usage.used)} / ${bytes(usage.total)}`}</small>:<small>{note??'—'}</small>}<div className="system-usage-track" aria-hidden="true"><span data-level={value!==null&&value>=95?'critical':value!==null&&value>=80?'warning':'normal'} style={{width:`${Math.min(100,Math.max(0,value??0))}%`}}/></div></article>;
}
function ResourceChart({history,range,onRangeChange,loading,error,retry}:{history:SystemSample[];range:ResourceRange;onRangeChange:(value:ResourceRange)=>void;loading:boolean;error:string;retry:()=>void}){
 const chart=useMemo(()=>buildResourceChart(history,range),[history,range]),settings=resourceRanges[range];
 const [activeAt,setActiveAt]=useState<number|null>(null),tooltipId=useId();
 const [keyboardFocus,setKeyboardFocus]=useState(false);
 const activePoint=chart.points.find(point=>point.at===activeAt)??null;
 const inspect=(event:PointerEvent<SVGSVGElement>)=>{setKeyboardFocus(false);const bounds=event.currentTarget.getBoundingClientRect();setActiveAt(resourceChartPoint(chart,(event.clientX-bounds.left)/bounds.width*resourceChartSize.width)?.at??null);};
 const clock=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
 const dateClock=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'});
 const tickLabel=(at:number)=>settings.duration>=86400000?`${dateClock.format(at).replaceAll(' ','').replace(/\.$/,'')} ${clock.format(at)}`:clock.format(at);
 const ticks=chart.start===null||chart.end===null?[]:[0,.25,.5,.75,1];
 const averageLabel=settings.average===60?'1시간 평균':`${settings.average}분 평균`;
 return <section className="workspace-panel system-chart" aria-busy={loading}><div className="workspace-toolbar"><h2>자원 사용 추이</h2><div className="workspace-tools system-chart-controls"><div className="system-legend"><span><i/>CPU</span><span><i/>메모리</span><span>{averageLabel}</span></div><div className="system-range-select"><CustomSelect value={range} onChange={value=>{if(isResourceRange(value)){setActiveAt(null);onRangeChange(value);}}} label="자원 조회 기간" options={Object.entries(resourceRanges).map(([value,item])=>({value,label:item.label}))}/></div></div></div>
  {loading?<WorkspaceSkeleton/>:error?<Empty error={error} retry={retry}/>:!chart.points.length?<Empty message="이 기간에 수집된 자원 기록이 없어요"/>:<div className="system-chart-plot">
   <div className="system-chart-scale" aria-hidden="true">{[100,75,50,25,0].map(value=><span key={value} style={{top:`${resourceChartY(value)/resourceChartSize.height*100}%`}}>{value}%</span>)}</div>
   <div className="system-chart-gaps" aria-hidden="true">{chart.unrecorded?<div className="system-chart-blank" style={{left:`${chart.unrecorded.from/10}%`,width:`${(chart.unrecorded.to-chart.unrecorded.from)/10}%`}}><span>기록 없음</span></div>:null}{chart.gaps.map(gap=><div key={gap.from.at} className="system-chart-gap" style={{left:`${gap.from.x/10}%`,width:`${(gap.to.x-gap.from.x)/10}%`}} title={`${clock.format(gap.from.at)} ~ ${clock.format(gap.to.at)} 수집 중단`}><span>수집 중단</span></div>)}</div>
   <div className="system-chart-surface"><svg viewBox={`0 0 ${resourceChartSize.width} ${resourceChartSize.height}`} preserveAspectRatio="none" role="img" tabIndex={0} data-keyboard-focus={keyboardFocus||undefined} aria-describedby={activePoint?tooltipId:undefined} aria-label={`${settings.label}의 CPU와 메모리 사용률 ${averageLabel}, 가로축은 한국 시간이며 회색 영역은 수집 중단 또는 기록이 없는 구간 · 좌우 방향키로 기록 확인`}
    onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={event=>{if(event.pointerType!=='touch')setActiveAt(null);}} onPointerCancel={()=>setActiveAt(null)}
    onFocus={event=>{setKeyboardFocus(event.currentTarget.matches(':focus-visible'));setActiveAt(current=>current??chart.points.at(-1)?.at??null);}} onBlur={()=>{setKeyboardFocus(false);setActiveAt(null);}}
    onKeyDown={event=>{
     if(event.key==='Escape'){event.preventDefault();setActiveAt(null);return;}
     if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
     setKeyboardFocus(true);
     event.preventDefault();const index=chart.points.findIndex(point=>point.at===activeAt),last=chart.points.length-1;
     const next=event.key==='Home'?0:event.key==='End'?last:Math.min(last,Math.max(0,(index<0?last:index)+(event.key==='ArrowLeft'?-1:1)));
     setActiveAt(chart.points[next]?.at??null);
    }}>
    {[100,75,50,25,0].map(value=><line key={value} x1="12" x2="988" y1={resourceChartY(value)} y2={resourceChartY(value)} className="system-chart-grid"/>)}
    <path d={chart.paths.cpu} className="system-chart-cpu"/><path d={chart.paths.memory} className="system-chart-memory"/>
    {(['cpu','memory'] as const).flatMap(field=>chart.dots[field].map(point=><circle key={`${field}:${point.at}`} cx={point.x} cy={resourceChartY(point[field]!)} r="0.1" strokeWidth="5" vectorEffect="non-scaling-stroke" className={`system-dot-${field}`}/>))}
    {activePoint?<g className="system-chart-cursor" aria-hidden="true"><line x1={activePoint.x} x2={activePoint.x} y1="12" y2="208"/>{(['cpu','memory'] as const).map(field=>activePoint[field]===null?null:<circle key={field} cx={activePoint.x} cy={resourceChartY(activePoint[field]!)} r="0.1" strokeWidth="7" vectorEffect="non-scaling-stroke" className={`system-dot-${field}`}/>)}</g>:null}
   </svg>{activePoint?<div id={tooltipId} role="tooltip" className="system-chart-tooltip" style={{left:`clamp(0px, calc(${activePoint.x/10}% - 90px), max(0px, calc(100% - 180px)))`}}>
    <time dateTime={new Date(activePoint.at).toISOString()}>{tickLabel(activePoint.at)}</time><dl><div><dt>CPU</dt><dd>{activePoint.cpu===null?'기록 없음':percent(activePoint.cpu)}</dd></div><div><dt>메모리</dt><dd>{activePoint.memory===null?'기록 없음':percent(activePoint.memory)}</dd></div></dl><span>{averageLabel} · 한국 시간</span>
   </div>:null}</div>
   <div className="system-chart-times" aria-hidden="true">{ticks.map(fraction=>{const at=chart.start!+(chart.end!-chart.start!)*fraction;return <time key={fraction} dateTime={new Date(at).toISOString()} title={dateLabel(new Date(at).toISOString(),true)} data-minor={fraction===.25||fraction===.75} data-edge={fraction===0?'start':fraction===1?'end':undefined} style={{left:`${(12+fraction*976)/1000*100}%`}}>{tickLabel(at)}</time>;})}</div>
  </div>}
 </section>;
}
export function SystemWorkspace({active=true}:{active?:boolean}={}){
 const [data,setData]=useState<MonitoringResponse|null>(null),[error,setError]=useState(''),[refreshing,setRefreshing]=useState(false),[revision,setRevision]=useState(0);
 const [now,setNow]=useState(()=>Date.now());
 const [range,setRange]=useState<ResourceRange>('1h');
 const [actionMessage,setActionMessage]=useState('');
 const clearActionMessage=useCallback(()=>setActionMessage(''),[]);
 useEffect(()=>{
  let disposed=false,pending=false;
  const load=async()=>{
   if(pending)return;pending=true;setRefreshing(true);setNow(Date.now());
   try{
    const session=await authClient!.auth.getSession();
    if(session.error||!session.data.session)throw Error('로그인 상태를 확인해 주세요');
    const response=await fetch(adminApiUrl('system-metrics'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({environment:authEnvironment,range}),signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    if(!response.ok)throw Error(body.error||'서버 모니터링 정보를 불러오지 못했어요');
    if(!body.current||body.range!==range||!Array.isArray(body.history)||!Array.isArray(body.events))throw Error('서버 모니터링 응답을 확인할 수 없어요');
    if(!disposed){setData({...body,range} as MonitoringResponse);setError('');}
   }catch{if(!disposed)setError('모니터링 연결을 확인할 수 없어요 마지막 수집 시각을 확인해 주세요');}
   finally{pending=false;if(!disposed){setRefreshing(false);setNow(Date.now());}}
  };
  void load();const timer=setInterval(()=>{if(!document.hidden)void load();},60000);
  const visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[revision,range]);
 const refresh=()=>setRevision(value=>value+1);
 const current=data?.current;
 const stale=Boolean(error)||(current?now-Date.parse(current.observedAt)>150000:false);
 const status=stale?'unreachable':current?.status??'unknown';
 const storagePlan=data?.storagePlan;
 return <div className="system-workspace"><div className="workspace-toolbar standalone system-heading"><div className="system-heading-title"><h2>서버 모니터링</h2><Badge tone={tone(status)}>{refreshing&&!data?'연결 확인 중':statuses[status]}</Badge></div><div className="workspace-actions"><DatabaseRestartControl capability={data?.restart} now={now} onRequested={refresh} onMessage={setActionMessage}/><Refresh disabled={refreshing} onClick={refresh}/></div></div>
  {error&&(!data||data.range===range)?<Empty error={error} retry={refresh}/>:null}
  {active&&(actionMessage||data?.historyError)?<Toast key={actionMessage||data?.historyError} message={actionMessage||data!.historyError!} onDismiss={actionMessage?clearActionMessage:undefined}/>:null}
  {!data&&!error?<WorkspaceSkeleton/>:data?<>
   <div className="system-resources" aria-label="Supabase 데이터베이스 서버 자원"><ResourceCard label="CPU" value={stale?null:current?.cpu??null} note={current?.cpuIssue?cpuIssues[current.cpuIssue]:'최근 5분 평균'}/><ResourceCard label="메모리" value={stale?null:current?.memory?.rate??null} usage={stale?null:current?.memory}/><ResourceCard label="DB 디스크" value={stale?null:current?.disk?.rate??null} usage={stale?null:current?.disk}/><ResourceCard label="DB 연결" value={stale?null:current?.connections?.rate??null} usage={stale?null:current?.connections}/></div>
   <div className="system-chart-link"><a className="quiet-button" href={data.dashboardUrl} target="_blank" rel="noreferrer">Supabase 지표 보기</a></div>
   <ResourceChart history={data.range===range?data.history:[]} range={range} onRangeChange={setRange} loading={data.range!==range&&!error} error={data.range!==range?error:''} retry={refresh}/>
   {storagePlan?<BillingUsage plan={storagePlan} current={current} stale={stale}/>:null}
  </>:null}
 </div>;
}

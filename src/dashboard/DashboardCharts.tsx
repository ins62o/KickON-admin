import {useEffect,useState} from "react";
import {CustomSelect} from "../components/CustomSelect";
import {AnimatedNumber} from "../components/AnimatedNumber";
import {visibleDays,type Trend,type ProviderUsage} from "./data";
export function ActivityChart({trend,failed,period,onPeriodChange}: {trend:Trend|undefined;failed:boolean;period:number;onPeriodChange:(value:number)=>void}) {
  const [selected,setSelected]=useState<string|null>(null);
  const days=trend?visibleDays(trend,period):[];
  const today=trend?.today??new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const slots=Array.from({length:period},(_,index)=>{const date=new Date(Date.parse(today)-(period-1-index)*86400000).toISOString().slice(0,10);return {date,day:days.find(day=>day.date===date)};});
  const max=Math.max(4,...days.map(day=>day.mau));
  const unit=10**Math.max(0,Math.floor(Math.log10(max/4)));
  const ceiling=Math.ceil(max/(unit*4))*unit*4;
  const chosen=days.find(day=>day.date===selected)??days.at(-1);
  const path=(field:"dau"|"mau")=>{let connected=false;return slots.map(({day},index)=>{if(!day){connected=false;return "";}const command=connected?"L":"M";connected=true;return `${command}${((index+.5)/period*640).toFixed(2)},${(182-day[field]/ceiling*174).toFixed(2)}`;}).join(" ");};
  return <section id="activity" className="dashboard-panel activity-panel" aria-labelledby="activity-heading">
    <div className="panel-heading"><h2 id="activity-heading">이용 추이</h2><CustomSelect label="이용 추이 기간" value={String(period)} options={[7,14,30].map(value=>({value:String(value),label:`최근 ${value}일`}))} onChange={value=>{onPeriodChange(Number(value));setSelected(null);}}/></div>
    <div className="chart-legend"><span><i className="legend-dau"/>일간 활동</span><span><i className="legend-mau"/>월간 활동</span><span className="chart-unit">단위 : 명</span></div>
    <div className="line-chart"><div className="chart-scale">{[4,3,2,1,0].map(value=><span key={value}>{(ceiling*value/4).toLocaleString("ko-KR")}</span>)}</div>
      <div className="line-plot"><svg viewBox="0 0 640 190" preserveAspectRatio="none" role="img" aria-label="일간 활동은 파란색, 월간 활동은 노란색으로 표시한 이용 추이 그래프">
        {[0,1,2,3,4].map(i=><line key={i} x1="0" x2="640" y1={8+i*43.5} y2={8+i*43.5} className="line-grid"/>)}
        <path d={path("mau")} className="trend-line trend-mau"/><path d={path("dau")} className="trend-line trend-dau"/>
        {slots.map(({day,date},i)=>day?<g key={date}><circle cx={(i+.5)/period*640} cy={182-day.mau/ceiling*174} r={chosen?.date===date?4:2.5} className="point-mau"/><circle cx={(i+.5)/period*640} cy={182-day.dau/ceiling*174} r={chosen?.date===date?4:2.5} className="point-dau"/></g>:null)}
      </svg>
      {slots.map(({date,day},i)=><button key={date} type="button" className={`line-day${chosen?.date===date?" line-day-selected":""}`} style={{left:`${i/period*100}%`,width:`${100/period}%`}} disabled={!day} aria-label={`${date} ${day?`일간 ${day.dau}명 월간 ${day.mau}명`:"미집계"}`} aria-pressed={chosen?.date===date} onMouseEnter={()=>setSelected(date)} onFocus={()=>setSelected(date)} onClick={()=>setSelected(date)}><span className="line-day-label">{period===7||i===0||i===period-1||i%(period===14?3:6)===0?`${Number(date.slice(5,7))}/${Number(date.slice(8))}`:""}</span></button>)}
      {!days.length?<div className="line-chart-empty">{failed?"이용 추이 집계가 아직 연결되지 않았어요":"아직 집계된 이용 기록이 없어요"}</div>:null}
      </div>
    </div>
    <div className="chart-detail" aria-live="polite">{chosen?<><span>{chosen.date.replaceAll("-","/")}</span><span>일간 <b>{chosen.dau.toLocaleString("ko-KR")}</b></span><span>월간 <b>{chosen.mau.toLocaleString("ko-KR")}</b></span></>:null}</div>
  </section>;
}
export function ProviderGauge({quota,failed}: {quota:ProviderUsage;failed:boolean}) {
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{if(!quota.resetAt)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,Date.parse(quota.resetAt)-Date.now()+10));return()=>clearTimeout(timer);},[quota.resetAt]);
  const fresh=quota.resetAt!==null&&Date.parse(quota.resetAt)>now;
  const rate=fresh?quota.rate:null,remaining=fresh?quota.remaining:null,used=fresh?quota.used:null;
  return <section className="dashboard-panel provider-panel" aria-labelledby="provider-heading"><div className="panel-heading"><h2 id="provider-heading">스포츠 API 사용량</h2></div>
    <div className="gauge provider-gauge" data-usage-level={rate===null?undefined:rate>=80?"critical":rate>=50?"warning":"normal"} role={rate===null?"group":"meter"} aria-label={rate===null?"스포츠 API 호출 사용률 집계 불가":"스포츠 API 호출 사용률"} aria-valuemin={rate===null?undefined:0} aria-valuemax={rate===null?undefined:100} aria-valuenow={rate??undefined} aria-valuetext={rate===null?undefined:`${rate.toFixed(1)}%`}>
      <svg viewBox="0 0 260 145" aria-hidden="true"><path d="M25 126 A105 105 0 0 1 235 126" className="quota-track"/>{rate!==null&&rate>0?<path d="M25 126 A105 105 0 0 1 235 126" className="quota-fill" pathLength="100" strokeDasharray={`${rate} 200`}/>:null}</svg>
      <strong>{rate===null?"—":<AnimatedNumber value={rate} digits={1}/>}<small>{rate===null?"":"%"}</small></strong>
    </div>
    <div className="provider-limit">{quota.allowance!==null?`한도 ${quota.allowance.toLocaleString("ko-KR")}회`:"한도 미설정"}</div>
    <div className="gauge-totals"><div><span>사용한 호출</span><b>{used===null?"—":<><AnimatedNumber value={used}/>회</>}</b></div><div><span>남은 호출</span><b>{remaining===null?"—":<><AnimatedNumber value={remaining}/>회</>}</b></div></div>
    {failed||rate===null?<div className="provider-notice">{quota.unavailableReason==="not_configured"?"사용량 조회 연결 설정이 필요해요":failed?"사용량을 불러오지 못했어요":"최신 호출 기록을 기다리고 있어요"}</div>:null}
  </section>;
}

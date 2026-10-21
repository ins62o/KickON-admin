import type {StoragePlan,SystemSample} from './system-health';
import {Badge} from './WorkspaceUI';

const amount=(value:number)=>value.toLocaleString('ko-KR',{maximumFractionDigits:3});
const bytes=(value:number)=>value>=1e9?`${amount(value/1e9)}GB`:value>=1e6?`${(value/1e6).toLocaleString('ko-KR',{maximumFractionDigits:1})}MB`:value>=1e3?`${amount(value/1e3)}KB`:`${amount(value)}B`;
function UsageMeter({label,used,included}:{label:string;used:number|null|undefined;included:number}){
 const measured=typeof used==='number'&&Number.isFinite(used)&&used>=0?used:null;
 const ratio=measured===null?null:measured/included*100;
 const rate=ratio!==null&&included>0&&Number.isFinite(included)&&Number.isFinite(ratio)?ratio:null;
 const percent=rate===null?'비율 확인 불가':rate>0&&rate<0.01?'0.01% 미만':`${rate.toLocaleString('ko-KR',{maximumFractionDigits:2})}%`;
 const format=(value:number)=>Number.isFinite(value)&&value>=0?bytes(value):'—';
 const description=`${measured===null?'—':format(measured)} / ${format(included)}`;
 return <article className="system-billing-item">
  <div className="system-billing-item-heading"><h3>{label}</h3><span className="system-billing-amount"><b>{measured===null?'—':format(measured)}</b><span> / {format(included)}</span></span><span className="system-billing-rate">{percent}</span></div>
  <div className="system-billing-track" role={rate===null?'img':'meter'} aria-label={`${label} 사용률${rate===null?' 확인 불가':''}`} aria-valuemin={rate===null?undefined:0} aria-valuemax={rate===null?undefined:100} aria-valuenow={rate===null?undefined:Math.min(100,rate)} aria-valuetext={rate===null?undefined:`${description} · ${percent}`} data-unavailable={rate===null||undefined}>
   {rate!==null?<span data-level={rate>=95?'critical':rate>=80?'warning':'normal'} style={{width:`${Math.min(100,rate)}%`}}/>:null}
  </div>
 </article>;
}
export function BillingUsage({plan,current,stale}:{plan:StoragePlan;current:SystemSample|undefined;stale:boolean}){
 const database=stale?null:current?.databaseBytes,storage=stale?null:current?.storageBytes;
 const ready=[database,storage].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0);
 return <section className="system-billing-section">
  <div className="workspace-toolbar standalone"><div className="system-heading-title"><h2>Supabase Pro 사용량</h2><Badge tone={ready?'green':'orange'}>{ready?'자동 수집':'저장 용량 확인 필요'}</Badge></div><div className="workspace-actions"><a className="quiet-button" href={plan.source} target="_blank" rel="noreferrer">Supabase 사용량 페이지</a></div></div>
  <div className="workspace-panel system-billing-panel system-billing-list" aria-label="자동 수집한 현재 저장 용량">
   <UsageMeter label="DB 저장 용량" used={database} included={plan.databaseIncludedBytes}/>
   <UsageMeter label="파일 저장 공간" used={storage} included={plan.storageIncludedBytes}/>
  </div>
 </section>;
}

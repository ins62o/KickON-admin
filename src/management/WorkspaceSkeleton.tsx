import type {CSSProperties} from "react";
// Kept apart from WorkspaceUI so the dashboard can show it while a workspace's code is still loading.
// Each shape mirrors the layout it stands in for, so content replaces it without the page jumping.
export type SkeletonShape="table"|"list"|"cards"|"monitor"|"chart"|"detail";
type Props={shape?:SkeletonShape;rows?:number;rowHeight?:number;columns?:number;media?:boolean;numeric?:number};
const range=(count:number)=>Array.from({length:count},(_,index)=>index);
const line=(className:string,key?:number)=><span key={key} className={`skeleton-line ${className}`}/>;

export function WorkspaceSkeleton({shape="table",rows=5,rowHeight=56,columns=4,media=false,numeric=0}:Props){
  const style={"--skeleton-row":`${rowHeight}px`,"--skeleton-columns":columns} as CSSProperties;
  return <div className={`workspace-skeleton workspace-skeleton-${shape}`} style={style} aria-busy="true" aria-label="불러오는 중" role="status">{body(shape,rows,columns,media,numeric)}</div>;
}

function body(shape:SkeletonShape,rows:number,columns:number,media:boolean,numeric:number){
  if(shape==="monitor")return <>
    <div className="system-resources">{range(4).map(i=><div key={i} className="system-resource">{line("skeleton-text-label")}{line("skeleton-text-value")}{line("skeleton-text-note")}</div>)}</div>
    <div className="workspace-panel skeleton-chart-panel">{line("skeleton-text-title")}{line("skeleton-chart-block")}</div>
  </>;
  if(shape==="chart")return line("skeleton-chart-block");
  if(shape==="cards")return range(2).map(i=><div key={i} className="skeleton-card">{line("skeleton-text-title")}{line("skeleton-text-note")}{line("skeleton-field")}{line("skeleton-text-note")}</div>);
  if(shape==="detail")return range(rows).map(i=><div key={i} className="skeleton-detail-row">{line("skeleton-detail-label")}{line("skeleton-detail-value")}</div>);
  const cells=(row:number)=>range(columns).map(column=><span key={column} className={`skeleton-cell${column>=columns-numeric?" skeleton-cell-numeric":""}`}>{column===0&&media?line("skeleton-media"):null}{line(column===0?"skeleton-cell-primary":row<0?"skeleton-cell-head":"skeleton-cell-text")}</span>);
  return <>
    {shape==="table"?<div className="skeleton-table-head">{cells(-1)}</div>:null}
    {range(rows).map(row=><div key={row} className="skeleton-table-row">{shape==="table"?cells(row):<span className="skeleton-cell">{media?line("skeleton-media"):null}{line("skeleton-cell-primary")}</span>}</div>)}
  </>;
}

// Shown while a workspace's code downloads: the same frame as the screen that replaces it.
export function WorkspacePageSkeleton({stats,tabs=0,tabsFirst=false,shape="table"}:{stats:number;tabs?:number;tabsFirst?:boolean;shape?:SkeletonShape}){
  const tabRow=tabs?<div className="skeleton-tabs">{range(tabs).map(i=>line("skeleton-tab",i))}</div>:null;
  return <div className="management-workspace workspace-page-skeleton" aria-busy="true" aria-label="불러오는 중">
    {tabsFirst?tabRow:null}
    {stats?<div className={`workspace-stats${stats===3?" three":""}`}>{range(stats).map(i=><div key={i} className="workspace-stat">{line("skeleton-text-label")}{line("skeleton-text-value")}</div>)}</div>:null}
    {tabsFirst?null:tabRow}
    {shape==="monitor"?<WorkspaceSkeleton shape="monitor"/>:<section className="workspace-panel"><div className="workspace-toolbar">{line("skeleton-text-title")}</div><WorkspaceSkeleton/></section>}
  </div>;
}

import {useEffect,useId,useRef,useState,type ReactNode} from "react";
import {Search,X,RefreshCw,Inbox,TriangleAlert} from "lucide-react";
import {AnimatedNumber} from "../components/AnimatedNumber";
import {Toast} from "../components/Toast";
import {ActionButton,Badge as SeedBadge,Skeleton,Tabs,TextField} from "@seed-design/react";
import {CustomSelect} from '../components/CustomSelect';
export function WorkspaceTabs({value,items,onChange,children,label="관리 항목",mobileSelect=false}:{value:string;items:{value:string;label:string;count?:number|null}[];onChange:(value:string)=>void;children?:ReactNode;label?:string;mobileSelect?:boolean}){
  const select=mobileSelect?<div className="workspace-tabs-mobile"><CustomSelect label={label} value={value} options={items} onChange={onChange}/></div>:null;
  if(children!==undefined)return <Tabs.Root className="workspace-tab-content" value={value} onValueChange={onChange} triggerLayout="hug" size="medium">{select}<Tabs.List className={mobileSelect?'workspace-tabs-desktop':undefined} aria-label={label}>{items.map(item=><Tabs.Trigger key={item.value} value={item.value}>{item.label}{item.count!==undefined?<span>{item.count===null?"—":item.count}</span>:null}</Tabs.Trigger>)}<Tabs.Indicator/></Tabs.List><Tabs.Content value={value}>{children}</Tabs.Content></Tabs.Root>;
  const navigation=<nav className={`workspace-filter-tabs${mobileSelect?' workspace-tabs-desktop':''}`} aria-label={label}>{items.map(item=><ActionButton variant="ghost" size="small" type="button" key={item.value} aria-pressed={value===item.value} onClick={()=>onChange(item.value)}>{item.label}{item.count!==undefined?<span>{item.count===null?"—":item.count}</span>:null}</ActionButton>)}</nav>;
  return mobileSelect?<div className="workspace-tabs-responsive">{select}{navigation}</div>:navigation;
}
export function SearchField({value,onChange,placeholder="검색"}:{value:string;onChange:(value:string)=>void;placeholder?:string}){
  return <TextField.Root className="workspace-seed-search" size="responsive"><TextField.PrefixIcon svg={<Search aria-hidden="true"/>}/><TextField.Input type="search" value={value} aria-label={placeholder} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/></TextField.Root>;
}
export function Stat({label,value,unit="",children,loading=false,onClick,pressed,disabled=false}:{label:string;value:number|null;unit?:string;children?:ReactNode;loading?:boolean;onClick?:()=>void;pressed?:boolean;disabled?:boolean}){
  const Component=onClick?"button":"article";
  return <Component type={onClick?"button":undefined} className={`workspace-stat${onClick?" workspace-stat-link":""}`} aria-busy={loading} aria-label={onClick?`${label} 목록 보기`:undefined} aria-pressed={onClick?pressed:undefined} disabled={onClick?disabled:undefined} onClick={onClick}><span>{label}</span><strong>{loading?<><span className="skeleton-line workspace-stat-loading" aria-hidden="true"/><span className="visually-hidden">불러오는 중</span></>:value===null?"—":<AnimatedNumber value={value}/>}<small>{loading||value===null?"":unit}</small></strong>{children}</Component>;
}
export function Empty({error="",message="등록된 내용이 없어요",retry}:{error?:string;message?:string;retry?:()=>void}){
  const StateIcon=error?TriangleAlert:Inbox;
  return <div className="workspace-empty" role="status"><StateIcon size={22} strokeWidth={1.6} aria-hidden="true"/><span>{error||message}</span>{error&&retry?<ActionButton type="button" variant="ghost" size="small" onClick={retry}>다시 불러오기</ActionButton>:null}</div>;
}
export function WorkspaceSkeleton(){return <div className="workspace-skeleton" aria-busy="true" aria-label="불러오는 중">{[0,1,2,3,4].map(i=><Skeleton key={i} className="skeleton-row" height="42px" radius="8"/>)}</div>;}
export function Pager({page,total,onChange,pageSize=15,disabled=false,showTotal=true}:{page:number;total:number;onChange:(page:number)=>void;pageSize?:number;disabled?:boolean;showTotal?:boolean}){
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <div className="workspace-pager">{showTotal?<span>{total.toLocaleString("ko-KR")}건</span>:null}<div><ActionButton type="button" variant="neutralWeak" size="small" disabled={disabled||page<=1} onClick={()=>onChange(page-1)}>이전</ActionButton><span>{page} / {pages}</span><ActionButton type="button" variant="neutralWeak" size="small" disabled={disabled||page>=pages} onClick={()=>onChange(page+1)}>다음</ActionButton></div></div>;
}
export function Refresh({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){return <button className="admin-icon-button" type="button" aria-label="새로고침" title="새로고침" aria-busy={disabled} disabled={disabled} onClick={onClick}><RefreshCw size={20} aria-hidden="true"/></button>;}
export function Badge({children,tone="neutral"}:{children:ReactNode;tone?:string}){return <SeedBadge.Root variant="weak" tone={tone==="green"?"positive":tone==="red"?"critical":tone==="orange"?"warning":tone==="blue"?"brand":"neutral"}><SeedBadge.Label>{children}</SeedBadge.Label></SeedBadge.Root>;}
function outsideDialog(dialog:HTMLDialogElement,x:number,y:number){
  const bounds=dialog.getBoundingClientRect();
  return x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom;
}
export function Dialog({title,onClose,children,pending=false,className="",dismissOnBackdrop=true}:{title:string;onClose:()=>void;children:ReactNode;pending?:boolean;className?:string;dismissOnBackdrop?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),id=useId();
  const backdropPress=useRef(false),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [closing,setClosing]=useState(false);
  useEffect(()=>{const dialog=ref.current,opener=document.activeElement;dialog?.showModal();return()=>{if(closeTimer.current!==null)clearTimeout(closeTimer.current);dialog?.close();if(opener instanceof HTMLElement&&opener.isConnected)opener.focus();};},[]);
  const close=()=>{
    if(pending||closeTimer.current!==null)return;
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){onClose();return;}
    setClosing(true);closeTimer.current=setTimeout(onClose,160);
  };
  return <dialog ref={ref} className={`workspace-dialog ${className}`} aria-labelledby={id} data-closing={closing||undefined}
    onCancel={event=>{event.preventDefault();close();}}
    onPointerDown={event=>{backdropPress.current=event.target===event.currentTarget&&outsideDialog(event.currentTarget,event.clientX,event.clientY);}}
    onClick={event=>{const backdropClick=backdropPress.current&&event.target===event.currentTarget&&outsideDialog(event.currentTarget,event.clientX,event.clientY);backdropPress.current=false;if(dismissOnBackdrop&&backdropClick)close();}}>
    <header><h2 id={id}>{title}</h2><button type="button" aria-label="닫기" disabled={pending||closing} onClick={close}><X size={19}/></button></header>{children}
  </dialog>;
}

export function Feedback({message}:{message:string}){return message?<Toast key={message} message={message}/>:null;}

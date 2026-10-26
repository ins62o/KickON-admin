import {useEffect,useRef,useState,type CSSProperties} from "react";
import {UserRound} from "lucide-react";
import type {AdminIdentity} from "../auth/policy";
import {ThemeToggle} from "../components/ThemeToggle";
import {EnvironmentSelect} from "../components/EnvironmentSelect";
import {pages,type Page} from "./navigation";
export function AdminHeader({admin,page="dashboard",onNavigate,pending=false,signOut}: {admin:AdminIdentity|null;page?:Page;onNavigate?:(page:Page)=>void;pending?:boolean;signOut?:()=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:Event)=>{
      const target=event.target as Node;
      // The positioner also owns focus guards beside the portaled option list.
      const ownedMenu=[...root.current?.querySelectorAll('[role="combobox"][aria-controls]')??[]].some(trigger=>document.getElementById(trigger.getAttribute("aria-controls")!)?.parentElement?.contains(target));
      if(!root.current?.contains(target)&&!ownedMenu)setOpen(false);
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!event.defaultPrevented&&!(event.target instanceof Element&&event.target.closest('[role="listbox"]'))){setOpen(false);button.current?.focus();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("focusin",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("focusin",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  return <header className="dashboard-header"><div className="dashboard-header-inner"><div className="dashboard-brand"><ThemeToggle/><span className="admin-brand-name">KICKON <span>ADMIN</span></span></div><nav aria-label="관리자 메뉴" style={{"--active-index":Object.keys(pages).indexOf(page)} as CSSProperties}>{(Object.keys(pages) as Page[]).map(key=><button key={key} type="button" disabled={!admin} className={page===key?"nav-current":undefined} aria-current={page===key?"page":undefined} aria-controls="dashboard-main" onClick={()=>onNavigate?.(key)}>{pages[key]}</button>)}</nav>
    <div className="dashboard-account" ref={root}><button ref={button} type="button" className="account-trigger" aria-label="계정 메뉴" disabled={!admin||pending} aria-expanded={open} aria-controls="account-popover" onClick={()=>setOpen(v=>!v)}><UserRound size={19} strokeWidth={1.8} aria-hidden="true"/></button>
      {admin?<div id="account-popover" className="account-popover" role="region" aria-label="계정 정보" data-open={open} aria-hidden={!open} inert={!open}>
        <div className="account-identity"><span>로그인한 계정</span>{admin.email?<span className="account-email">{admin.email}</span>:null}</div>
        <div className="account-environment"><span>현재 환경</span><EnvironmentSelect disabled={pending}/></div>
        <button className="account-logout" type="button" disabled={pending} onClick={()=>void signOut?.()}>{pending?"로그아웃 중":"로그아웃"}</button>
      </div>:null}
    </div>
  </div></header>;
}

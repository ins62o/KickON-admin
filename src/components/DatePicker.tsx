import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from "react";
import {CalendarDays,ChevronLeft,ChevronRight} from "lucide-react";
import {displayDate,isDateValue,monthGrid,seoulToday,shiftDays,shiftMonths,spokenDate,weekdayIndex,withYearMonth,yearPage} from "./date-picker";
import "./DatePicker.css";

const weekdays=["일","월","화","수","목","금","토"];
type View="days"|"months"|"years";

// Fixed to the viewport so scrolling dialogs and panels never clip it; it opens upward when the space below is short.
function placePopover(anchor:HTMLElement,target:HTMLElement,align:"start"|"end"){
  const box=anchor.getBoundingClientRect(),gap=8,margin=12,width=target.offsetWidth,height=target.offsetHeight;
  const below=window.innerHeight-box.bottom-gap-margin,above=box.top-gap-margin;
  const top=below>=height||below>=above?box.bottom+gap:box.top-gap-height;
  const left=Math.min(Math.max(margin,align==="end"?box.right-width:box.left),window.innerWidth-width-margin);
  target.style.top=`${Math.max(margin,Math.min(top,window.innerHeight-margin-height))}px`;target.style.left=`${Math.max(margin,left)}px`;
}

// The KICKON calendar itself: day grid with keyboard moves, plus year and month pages for far-away dates.
function CalendarPopover({id,label,selected,anchor,toggle,align,onChoose,onClose}:{id:string;label:string;selected:string;anchor:HTMLElement;toggle:HTMLElement;align:"start"|"end";onChoose:(date:string)=>void;onClose:(returnFocus:boolean)=>void}){
  const today=seoulToday(),popover=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null);
  const [focus,setFocus]=useState(selected||today),[view,setView]=useState<View>("days"),moveFocus=useRef(false);
  const [year,month]=focus.split("-").map(Number),first=yearPage(year);
  useLayoutEffect(()=>{
    const target=popover.current;if(!target)return;
    const place=()=>placePopover(anchor,target,align);place();
    const observer=new ResizeObserver(place);observer.observe(target);
    window.addEventListener("resize",place);window.addEventListener("scroll",place,true);
    return()=>{observer.disconnect();window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[anchor,align]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!popover.current?.contains(target)&&!toggle.contains(target))onClose(false);};
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[onClose,toggle]);
  // Focus lands on the current day, month or year when the calendar opens or changes page, and then follows the keyboard only,
  // so the arrow buttons keep focus while paging.
  const focusCurrent=()=>body.current?.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus();
  useEffect(()=>{focusCurrent();},[view]);
  useEffect(()=>{if(moveFocus.current){moveFocus.current=false;focusCurrent();}},[focus]);
  const show=(next:View,date:string)=>{setView(next);setFocus(date);};
  const move=(event:KeyboardEvent<HTMLButtonElement>,date:string)=>{
    const next={ArrowLeft:shiftDays(date,-1),ArrowRight:shiftDays(date,1),ArrowUp:shiftDays(date,-7),ArrowDown:shiftDays(date,7),Home:shiftDays(date,-weekdayIndex(date)),End:shiftDays(date,6-weekdayIndex(date)),PageUp:shiftMonths(date,event.shiftKey?-12:-1),PageDown:shiftMonths(date,event.shiftKey?12:1)}[event.key];
    if(next){event.preventDefault();moveFocus.current=true;setFocus(next);}
  };
  const step=view==="days"?1:view==="months"?12:144;
  const title=view==="days"?`${year}년 ${month}월`:view==="months"?`${year}년`:`${first} – ${first+11}`;
  const unit=view==="days"?"달":view==="months"?"해":"연도";
  return <div id={id} ref={popover} className="date-picker-popover" role="dialog" aria-label={`${label} 달력`} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();onClose(true);}}}>
    <div className="date-picker-header">
      <button type="button" className="date-picker-nav" aria-label={`이전 ${unit}`} onClick={()=>setFocus(shiftMonths(focus,-step))}><ChevronLeft size={18} aria-hidden="true"/></button>
      <button type="button" className="date-picker-title" aria-live="polite" aria-label={view==="years"?`${title} 연도 목록`:`${title}, 연도와 월 선택`} disabled={view==="years"} onClick={()=>show(view==="days"?"months":"years",focus)}>{title}</button>
      <button type="button" className="date-picker-nav" aria-label={`다음 ${unit}`} onClick={()=>setFocus(shiftMonths(focus,step))}><ChevronRight size={18} aria-hidden="true"/></button>
    </div>
    <div ref={body}>
      {view==="days"?<div role="grid" aria-label={`${year}년 ${month}월`}>
        <div role="row" className="date-picker-weekdays">{weekdays.map(day=><span key={day} role="columnheader" aria-label={`${day}요일`}>{day}</span>)}</div>
        {monthGrid(year,month).map(week=><div role="row" className="date-picker-week" key={week[0].date}>{week.map(day=><button key={day.date} type="button" role="gridcell" className="date-picker-day" data-date={day.date} data-outside={day.inMonth?undefined:""} tabIndex={day.date===focus?0:-1} aria-selected={day.date===selected} aria-current={day.date===today?"date":undefined} aria-label={spokenDate(day.date)} onClick={()=>onChoose(day.date)} onKeyDown={event=>move(event,day.date)}>{day.day}</button>)}</div>)}
      </div>:<div className="date-picker-pages">
        {view==="months"?Array.from({length:12},(_,index)=>index+1).map(value=><button key={value} type="button" className="date-picker-page" tabIndex={value===month?0:-1} aria-pressed={value===month} onClick={()=>show("days",withYearMonth(focus,year,value))}>{value}월</button>)
        :Array.from({length:12},(_,index)=>first+index).map(value=><button key={value} type="button" className="date-picker-page" tabIndex={value===year?0:-1} aria-pressed={value===year} onClick={()=>show("months",withYearMonth(focus,value,month))}>{value}</button>)}
      </div>}
    </div>
    <div className="date-picker-footer"><button type="button" className="date-picker-today" onClick={()=>onChoose(today)}>오늘</button></div>
  </div>;
}

// KICKON calendar in place of the browser's own date picker, so it follows the admin theme everywhere.
export function DatePicker({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean}){
  const id=useId(),selected=isDateValue(value)?value:"";
  const [open,setOpen]=useState(false),[toggle,setToggle]=useState<HTMLButtonElement|null>(null);
  const close=(returnFocus:boolean)=>{setOpen(false);if(returnFocus)toggle?.focus();};
  return <div className="date-picker">
    <button ref={setToggle} type="button" className="date-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} aria-label={`${label}: ${selected?spokenDate(selected):"선택 안 함"}`} disabled={disabled} onClick={()=>setOpen(current=>!current)}>
      <span className={selected?undefined:"date-picker-placeholder"}>{selected?displayDate(selected):"날짜 선택"}</span><CalendarDays size={18} aria-hidden="true"/>
    </button>
    {open&&toggle?<CalendarPopover id={id} label={label} selected={selected} anchor={toggle} toggle={toggle} align="start" onChoose={date=>{onChange(date);close(true);}} onClose={close}/>:null}
  </div>;
}

// Calendar icon for a typed date field: the text stays editable and the calendar fills in the date part.
export function CalendarButton({label,value,onChange,anchor,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;anchor:HTMLElement|null;disabled?:boolean}){
  const id=useId(),[open,setOpen]=useState(false),[toggle,setToggle]=useState<HTMLButtonElement|null>(null);
  const close=(returnFocus:boolean)=>{setOpen(false);if(returnFocus)toggle?.focus();};
  return <>
    <button ref={setToggle} type="button" className="date-picker-icon-button" aria-label={`${label} 달력 열기`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} onClick={()=>setOpen(current=>!current)}><CalendarDays size={18} aria-hidden="true"/></button>
    {open&&toggle?<CalendarPopover id={id} label={label} selected={isDateValue(value)?value:""} anchor={anchor??toggle} toggle={toggle} align="end" onChoose={date=>{onChange(date);close(true);}} onClose={close}/>:null}
  </>;
}

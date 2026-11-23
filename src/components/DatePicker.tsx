import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {CalendarDays,ChevronLeft,ChevronRight} from "lucide-react";
import {displayDate,isDateValue,monthGrid,seoulToday,shiftDays,shiftMonths,spokenDate,weekdayIndex} from "./date-picker";
import "./DatePicker.css";

const weekdays=["일","월","화","수","목","금","토"];
// KICKON calendar in place of the browser's own date picker, so it follows the admin theme everywhere.
export function DatePicker({label,value,onChange,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean}){
  const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),grid=useRef<HTMLDivElement>(null);
  const today=seoulToday(),selected=isDateValue(value)?value:"";
  const [open,setOpen]=useState(false),[focus,setFocus]=useState(selected||today),moveFocus=useRef(false);
  const [year,month]=focus.split("-").map(Number);
  const close=(returnFocus=true)=>{setOpen(false);if(returnFocus)trigger.current?.focus();};
  const choose=(date:string)=>{onChange(date);close();};
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  // Focus follows the keyboard and the opening click only, so the month buttons keep focus while paging.
  useEffect(()=>{if(open&&moveFocus.current){moveFocus.current=false;grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();}},[open,focus]);
  const move=(event:KeyboardEvent<HTMLButtonElement>,date:string)=>{
    const next={ArrowLeft:shiftDays(date,-1),ArrowRight:shiftDays(date,1),ArrowUp:shiftDays(date,-7),ArrowDown:shiftDays(date,7),Home:shiftDays(date,-weekdayIndex(date)),End:shiftDays(date,6-weekdayIndex(date)),PageUp:shiftMonths(date,-1),PageDown:shiftMonths(date,1)}[event.key];
    if(next){event.preventDefault();moveFocus.current=true;setFocus(next);}
  };
  return <div className="date-picker" ref={root} onKeyDown={event=>{if(event.key==="Escape"&&open){event.stopPropagation();close();}}}>
    <button ref={trigger} type="button" className="date-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} aria-label={`${label}: ${selected?spokenDate(selected):"선택 안 함"}`} disabled={disabled} onClick={()=>{setFocus(selected||today);moveFocus.current=!open;setOpen(current=>!current);}}>
      <span className={selected?undefined:"date-picker-placeholder"}>{selected?displayDate(selected):"날짜 선택"}</span><CalendarDays size={18} aria-hidden="true"/>
    </button>
    {open?<div id={id} className="date-picker-popover" role="dialog" aria-label={`${label} 달력`}>
      <div className="date-picker-header">
        <button type="button" className="date-picker-nav" aria-label="이전 달" onClick={()=>setFocus(shiftMonths(focus,-1))}><ChevronLeft size={18} aria-hidden="true"/></button>
        <strong aria-live="polite">{year}년 {month}월</strong>
        <button type="button" className="date-picker-nav" aria-label="다음 달" onClick={()=>setFocus(shiftMonths(focus,1))}><ChevronRight size={18} aria-hidden="true"/></button>
      </div>
      <div ref={grid} role="grid" aria-label={`${year}년 ${month}월`}>
        <div role="row" className="date-picker-weekdays">{weekdays.map(day=><span key={day} role="columnheader" aria-label={`${day}요일`}>{day}</span>)}</div>
        {monthGrid(year,month).map(week=><div role="row" className="date-picker-week" key={week[0].date}>{week.map(day=><button key={day.date} type="button" role="gridcell" className="date-picker-day" data-date={day.date} data-outside={day.inMonth?undefined:""} tabIndex={day.date===focus?0:-1} aria-selected={day.date===selected} aria-current={day.date===today?"date":undefined} aria-label={spokenDate(day.date)} onClick={()=>choose(day.date)} onKeyDown={event=>move(event,day.date)}>{day.day}</button>)}</div>)}
      </div>
      <div className="date-picker-footer"><button type="button" className="date-picker-today" onClick={()=>choose(today)}>오늘</button></div>
    </div>:null}
  </div>;
}

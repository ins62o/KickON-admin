import {useId,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {fixtureKickoffValue} from './fixture-schedule';

const display=(value:string)=>value.replaceAll('-','. ').replace('T',' ');
export function FixtureKickoffField({value,disabled}:{value:string;disabled:boolean}){
 const id=useId(),[text,setText]=useState(()=>display(new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16)));
 return <div className="workspace-form-field">
  <label htmlFor={id}>경기 시간 · 한국 시간</label>
  <div className="fixture-kickoff-field">
   <input id={id} name="kickoff" value={text} onChange={event=>setText(event.target.value)} placeholder="YYYY. MM. DD HH:mm" maxLength={19} disabled={disabled}/>
   <span className="birth-date-calendar"><CalendarDays size={18} aria-hidden="true"/><input type="datetime-local" aria-label="경기 시간 달력" value={fixtureKickoffValue(text)} onChange={event=>setText(display(event.target.value))} onClick={event=>event.currentTarget.showPicker?.()} disabled={disabled}/></span>
  </div>
 </div>;
}

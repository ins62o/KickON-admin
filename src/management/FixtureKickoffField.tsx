import {useId,useState} from 'react';
import {CalendarButton} from '../components/DatePicker';
import {fixtureKickoffValue} from './fixture-schedule';

const display=(value:string)=>value.replaceAll('-','. ').replace('T',' ');
export function FixtureKickoffField({value,disabled}:{value:string;disabled:boolean}){
 const initial=new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16);
 const id=useId(),[field,setField]=useState<HTMLDivElement|null>(null),[text,setText]=useState(()=>display(initial));
 const kickoff=fixtureKickoffValue(text);
 // The calendar changes the day only; the typed kickoff time stays as it is.
 const pickDay=(date:string)=>setText(display(`${date}T${kickoff.slice(11)||text.match(/(\d{2}:\d{2})\s*$/)?.[1]||initial.slice(11)}`));
 return <div className="workspace-form-field">
  <label htmlFor={id}>경기 시간 · 한국 시간</label>
  <div className="fixture-kickoff-field" ref={setField}>
   <input id={id} name="kickoff" value={text} onChange={event=>setText(event.target.value)} placeholder="YYYY. MM. DD HH:mm" maxLength={19} disabled={disabled}/>
   <span className="birth-date-calendar"><CalendarButton label="경기 날짜" value={kickoff.slice(0,10)} anchor={field} disabled={disabled} onChange={pickDay}/></span>
  </div>
 </div>;
}

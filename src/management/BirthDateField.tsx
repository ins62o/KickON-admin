import {useId,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {birthDateValue} from './team-detail';

export function BirthDateField({value,disabled}:{value:string|null;disabled:boolean}){
 const id=useId(),[text,setText]=useState(value?.replaceAll('-','. ')??'');
 const date=birthDateValue(text);
 return <div className="workspace-form-field">
  <label htmlFor={id}>생년월일</label>
  <div className="birth-date-field">
   <input id={id} name="date_of_birth" value={text} onChange={event=>setText(event.target.value)} placeholder="YYYY. MM. DD" maxLength={12} disabled={disabled}/>
   <span className="birth-date-calendar"><CalendarDays size={18} aria-hidden="true"/><input type="date" aria-label="생년월일 달력" value={/^\d{4}-\d{2}-\d{2}$/.test(date)?date:''} onChange={event=>setText(event.target.value.replaceAll('-','. '))} onClick={event=>event.currentTarget.showPicker?.()} disabled={disabled}/></span>
  </div>
 </div>;
}

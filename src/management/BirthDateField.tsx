import {useId,useState} from 'react';
import {CalendarButton} from '../components/DatePicker';
import {birthDateValue} from './team-detail';

export function BirthDateField({value,disabled}:{value:string|null;disabled:boolean}){
 const id=useId(),[field,setField]=useState<HTMLDivElement|null>(null),[text,setText]=useState(value?.replaceAll('-','. ')??'');
 return <div className="workspace-form-field">
  <label htmlFor={id}>생년월일</label>
  <div className="birth-date-field" ref={setField}>
   <input id={id} name="date_of_birth" value={text} onChange={event=>setText(event.target.value)} placeholder="YYYY. MM. DD" maxLength={12} disabled={disabled}/>
   <span className="birth-date-calendar"><CalendarButton label="생년월일" value={birthDateValue(text)} anchor={field} disabled={disabled} onChange={date=>setText(date.replaceAll('-','. '))}/></span>
  </div>
 </div>;
}

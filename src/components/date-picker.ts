// Calendar math on plain YYYY-MM-DD strings in UTC, so the browser's time zone never shifts a day.
export type CalendarDay={date:string;day:number;inMonth:boolean};
const pad=(value:number)=>String(value).padStart(2,"0");
const toDate=(value:string)=>new Date(`${value}T00:00:00Z`);
const toValue=(date:Date)=>`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())}`;

export function isDateValue(value:string){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(toDate(value).getTime())&&toValue(toDate(value))===value;
}
export function shiftDays(value:string,days:number){const date=toDate(value);date.setUTCDate(date.getUTCDate()+days);return toValue(date);}
// Moving by months keeps the day when it exists and otherwise lands on the month's last day.
export function shiftMonths(value:string,months:number){
  const date=toDate(value),day=date.getUTCDate();
  const target=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+months,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(day,last));return toValue(target);
}
// Six Sunday-first weeks, so the grid keeps the same height in every month.
export function monthGrid(year:number,month:number):CalendarDay[][]{
  const first=new Date(Date.UTC(year,month-1,1)),cursor=new Date(first);cursor.setUTCDate(1-first.getUTCDay());
  return Array.from({length:6},()=>Array.from({length:7},()=>{const day={date:toValue(cursor),day:cursor.getUTCDate(),inMonth:cursor.getUTCMonth()===month-1};cursor.setUTCDate(cursor.getUTCDate()+1);return day;}));
}
// Jumps to a year and month from the year and month pages, keeping the day when that month has it.
export function withYearMonth(value:string,year:number,month:number){const day=Number(value.slice(8,10))||1,last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${pad(month)}-${pad(Math.min(day,last))}`;}
// Twelve years per page, aligned so a year always lands on the same page.
export const yearPage=(year:number)=>Math.floor(year/12)*12;
export const weekdayIndex=(value:string)=>toDate(value).getUTCDay();
export const displayDate=(value:string)=>isDateValue(value)?value.replaceAll("-",". "):"";
export const spokenDate=(value:string)=>{const [year,month,day]=value.split("-").map(Number);return `${year}년 ${month}월 ${day}일 ${"일월화수목금토"[weekdayIndex(value)]}요일`;};
export const seoulToday=(now=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);

import {dateLabel} from './model.ts';
import type {Fixture,Stadium} from './data.ts';

const fixtureWeekday=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'short'});
export function fixtureDateLabel(value:string){
 const label=dateLabel(value,true);
 return label==='—'?label:label.replace(/\. (?=\d{2}:\d{2}$)/,` (${fixtureWeekday.format(new Date(value))}) `);
}
export function fixtureKickoffValue(text:string){
 const value=text.trim().replace(/\s*\.\s*/g,'-').replace(' ','T');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return '';
 const date=new Date(`${value}Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,16)===value?value:'';
}
export const fixtureScore=(fixture:Pick<Fixture,'status'|'home_score'|'away_score'>)=>['SCHEDULED','NS'].includes(fixture.status)?null:`${fixture.home_score??'—'} : ${fixture.away_score??'—'}`;
export const fixtureStatuses:Record<string,string>={SCHEDULED:'예정',NS:'예정',LIVE:'진행 중',HT:'하프타임',FINISHED:'종료',FT:'종료',POSTPONED:'연기',CANCELLED:'취소'};
const stadiumAliases:Record<string,string>={'DGB대구은행파크':'대구iM뱅크PARK','수원종합운동장(캐슬파크)':'수원종합운동장'};
const stadiumKoreanNames:Record<string,string>={
 'sportmonks-venue-340382':'탄천종합운동장',
 'sportmonks-venue-1601':'부산아시아드주경기장',
 'sportmonks-venue-14126':'화성종합경기타운',
 'sportmonks-venue-71598':'효창운동장',
 'sportmonks-venue-340202':'용인미르스타디움',
};
export function stadiumName(stadium:Stadium){const name=(stadium.name_ko?.trim()||stadiumKoreanNames[stadium.id]||stadium.name).trim().replace(/\s+/g,' ');return stadiumAliases[name]??name;}
function sameStadium(a:Stadium,b:Stadium){
 if(stadiumName(a)!==stadiumName(b)||![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite))return false;
 const metres=Math.hypot((a.latitude-b.latitude)*111320,(a.longitude-b.longitude)*111320*Math.cos((a.latitude+b.latitude)*Math.PI/360));
 return metres<=100;
}
export function stadiumOptions(stadiums:Stadium[],currentId:string){
 const priority=(item:Stadium)=>item.id===currentId?0:item.id.startsWith('sportmonks-venue-')?1:2;
 const groups:Stadium[][]=[];
 for(const stadium of [...stadiums].sort((a,b)=>priority(a)-priority(b)||a.id.localeCompare(b.id))){
  const group=groups.find(rows=>rows.every(row=>sameStadium(row,stadium)));
  if(group)group.push(stadium);else groups.push([stadium]);
 }
 const options=groups.map(([stadium])=>({value:stadium.id,label:stadiumName(stadium)})).sort((a,b)=>a.label.localeCompare(b.label,'ko'));
 const duplicates=new Set(options.filter(option=>options.some(other=>other!==option&&other.label===option.label)).map(option=>option.label));
 for(const option of options){if(duplicates.has(option.label))option.label+=` · ${stadiums.find(item=>item.id===option.value)?.address||option.value}`;}
 const labels=options.map(option=>option.label);
 for(const option of options){if(labels.filter(label=>label===option.label).length>1)option.label+=` · ${option.value}`;}
 return stadiums.some(item=>item.id===currentId)?options:[{value:currentId,label:currentId?'현재 경기장 확인 필요':'경기장 선택',disabled:true},...options];
}

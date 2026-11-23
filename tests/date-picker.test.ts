import test from "node:test";
import assert from "node:assert/strict";
import {displayDate,isDateValue,monthGrid,seoulToday,shiftDays,shiftMonths,spokenDate,weekdayIndex} from "../src/components/date-picker.ts";

test("calendar grid is six Sunday-first weeks around the month",()=>{
  const weeks=monthGrid(2026,11);
  assert.equal(weeks.length,6);assert.ok(weeks.every(week=>week.length===7));
  assert.deepEqual(weeks[0][0],{date:"2026-11-01",day:1,inMonth:true});
  assert.equal(weeks.flat().filter(day=>day.inMonth).length,30);
  assert.deepEqual(monthGrid(2026,2)[0][0],{date:"2026-02-01",day:1,inMonth:true});
  assert.deepEqual(monthGrid(2026,10)[0][0],{date:"2026-09-27",day:27,inMonth:false});
});

test("keyboard moves cross months and years and keep the day where it exists",()=>{
  assert.equal(shiftDays("2026-11-30",1),"2026-12-01");
  assert.equal(shiftDays("2026-01-01",-1),"2025-12-31");
  assert.equal(shiftMonths("2026-01-31",1),"2026-02-28");
  assert.equal(shiftMonths("2026-12-15",1),"2027-01-15");
  assert.equal(shiftMonths("2026-03-31",-1),"2026-02-28");
  assert.equal(weekdayIndex("2026-11-23"),1);
});

test("only real dates are shown and read aloud",()=>{
  assert.equal(isDateValue("2026-11-23"),true);
  for(const value of ["","2026-02-30","2026-1-05","20261123"])assert.equal(isDateValue(value),false,value);
  assert.equal(displayDate("2026-11-23"),"2026. 11. 23.");
  assert.equal(displayDate("2026-02-30"),"");
  assert.equal(spokenDate("2026-11-28"),"2026년 11월 28일 토요일");
  assert.equal(seoulToday(new Date("2026-11-23T15:30:00Z")),"2026-11-24");
});

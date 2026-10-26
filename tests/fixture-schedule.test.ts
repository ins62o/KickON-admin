import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDateLabel,fixtureKickoffValue,fixtureScore,stadiumName,stadiumOptions} from '../src/management/fixture-schedule.ts';
import type {Stadium} from '../src/management/data.ts';
const venue=(id:string,name='서울월드컵경기장',latitude=37.56,longitude=126.89):Stadium=>({id,name,name_ko:name,latitude,longitude});
test('verified Korean venue names cover missing provider translations without overriding DB names or guessing unknown venues',()=>{
 const stadium={...venue('sportmonks-venue-340382','Tancheon Sports Complex (Seongnam)'),name_ko:null};
 assert.equal(stadiumName(stadium),'탄천종합운동장');assert.equal(stadiumName({...stadium,name_ko:'  탄천종합운동장 주경기장  '}),'탄천종합운동장 주경기장');
 assert.equal(stadiumName({...stadium,name_ko:'  '}),'탄천종합운동장');assert.equal(stadiumName({...stadium,id:'unknown'}),stadium.name);
 assert.ok(stadiumOptions([stadium],stadium.id).some(option=>option.value===stadium.id&&option.label==='탄천종합운동장'));
});
test('fixture dates include the Korean weekday without a trailing dot and use Korean time across midnight',()=>{
 assert.equal(fixtureDateLabel('2026-10-24T05:00:00Z'),'2026. 10. 24 (토) 14:00');
 assert.equal(fixtureDateLabel('2026-04-04T05:00:00Z'),'2026. 04. 04 (토) 14:00');
 assert.equal(fixtureDateLabel('2026-04-04T15:30:00Z'),'2026. 04. 05 (일) 00:30');
 assert.equal(fixtureDateLabel('invalid'),'—');
});
test('scheduled matches have no score while played matches retain zero and unknown scores',()=>{
 for(const status of ['SCHEDULED','NS'])assert.equal(fixtureScore({status,home_score:0,away_score:0}),null);
 assert.equal(fixtureScore({status:'FINISHED',home_score:0,away_score:2}),'0 : 2');assert.equal(fixtureScore({status:'LIVE',home_score:null,away_score:0}),'— : 0');
});
test('stadium choices combine provider duplicates near each other and preserve the current fixture ID',()=>{
 const rows=[venue('api-venue-1'),venue('sportmonks-venue-1','서울월드컵경기장',37.56004),venue('manual-1')];
 assert.deepEqual(stadiumOptions(rows,'sportmonks-venue-1'),[{value:'sportmonks-venue-1',label:'서울월드컵경기장'}]);
 assert.deepEqual(stadiumOptions(rows,'api-venue-1'),[{value:'api-venue-1',label:'서울월드컵경기장'}]);
 const options=stadiumOptions([...rows,venue('other','다른 경기장')],'other');assert.equal(options.length,2);assert.equal(options.find(option=>option.label==='서울월드컵경기장')?.value,'sportmonks-venue-1');
 assert.equal(rows.length,3);assert.equal(rows[0].id,'api-venue-1');
});
test('known alternate names combine only at the same location, with unique labels for unrelated grounds',()=>{
 const rows=[venue('api-venue-1','DGB대구은행파크'),venue('sportmonks-venue-1','대구iM뱅크PARK'),venue('a','수원종합운동장'),venue('b','수원종합운동장(캐슬파크)'),{...venue('distant','수원종합운동장',35),address:'다른 지역'}];
 const options=stadiumOptions(rows,'a');assert.equal(options.length,3);assert.equal(new Set(options.map(option=>option.label)).size,3);assert.ok(options.some(option=>option.value==='distant'));assert.ok(options.some(option=>option.value==='a'));assert.ok(options.some(option=>option.label==='대구iM뱅크PARK'));
 const missing=stadiumOptions(rows,'unknown');assert.equal(missing[0].value,'unknown');assert.equal(missing[0].disabled,true);
});

test('kickoff text accepts the displayed date without a final dot and rejects impossible dates or times',()=>{
 assert.equal(fixtureKickoffValue('2026. 10. 24 14:00'),'2026-10-24T14:00');
 assert.equal(fixtureKickoffValue('2026-10-24T14:00'),'2026-10-24T14:00');
 for(const text of ['2026. 02. 30 14:00','2026. 10. 24 24:00','2026. 10. 24 14:60','invalid',''])assert.equal(fixtureKickoffValue(text),'');
});

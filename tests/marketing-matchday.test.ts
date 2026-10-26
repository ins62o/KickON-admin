import test from 'node:test';
import assert from 'node:assert/strict';
import {matchdayMatches,matchdayGroups} from '../src/management/marketing-matchday.ts';
import {newDraft,parseDrafts,validateDraft,saveDraft} from '../src/management/marketing-drafts.ts';
import type {Fixture,Stadium} from '../src/management/data.ts';
import type {Team} from '../src/management/model.ts';
const teams=[{id:'jeonnam',name:'전남 드래곤즈',short_name:'전남'},{id:'daegu',name:'대구 FC',short_name:'대구'}] as Team[];
const stadiums=[{id:'suncheon',name:'순천팔마종합운동장',name_ko:'순천팔마종합운동장'}] as Stadium[];
const fixture={id:'fixture',league_id:'kleague2',round:30,home_team_id:'jeonnam',away_team_id:'daegu',stadium_id:'suncheon',kickoff_at:'2026-10-24T05:00:00Z',status:'SCHEDULED'} as Fixture;
test('matchday captures each fixture venue instead of guessing the home club stadium',()=>{
 const [match]=matchdayMatches([fixture],teams,stadiums);
 assert.equal(match.stadium,'순천팔마종합운동장');assert.equal(match.homeName,'전남');assert.equal(match.awayName,'대구');
 assert.throws(()=>matchdayMatches([fixture],teams,[]),/경기장/);
 assert.throws(()=>matchdayMatches([{...fixture,league_id:'unknown'}],teams,stadiums),/리그/);
 assert.equal(matchdayMatches([{...fixture,status:'CANCELLED'}],teams,stadiums).length,0);
});
test('matchday groups each division once and sorts kickoff times across different rounds',()=>{
 const [match]=matchdayMatches([fixture],teams,stadiums);
 const groups=matchdayGroups([match,{...match,id:'k1',leagueId:'kleague',round:33},{...match,id:'later',kickoffAt:'2026-10-24T07:30:00Z'},{...match,id:'another-round',round:31,kickoffAt:'2026-10-24T06:00:00Z'}]);
 assert.deepEqual(groups.map(group=>[group.leagueId,group.matches.map(row=>row.id)]),[['kleague',['k1']],['kleague2',['fixture','another-round','later']]]);
});
test('matchday drafts retain selected fixture snapshots and reject missing or mismatched dates',()=>{
 const draft={...newDraft('notice','2026-10-24'),matchday:{matches:matchdayMatches([fixture],teams,stadiums),footer:'킥온에서 직관 인증 하러가기'}};
 assert.doesNotThrow(()=>validateDraft(draft));
 const saved=saveDraft([],draft,'saved','2026-10-24T01:00:00Z');assert.deepEqual(parseDrafts(JSON.stringify(saved)),saved);
 assert.throws(()=>validateDraft({...draft,matchday:{...draft.matchday,matches:[]}}),/경기/);
 assert.throws(()=>validateDraft({...draft,date:'2026-10-25'}),/경기 날짜/);
 assert.throws(()=>validateDraft({...draft,matchday:{...draft.matchday,matches:[...draft.matchday.matches,...draft.matchday.matches]}}),/중복/);
 assert.equal(parseDrafts(JSON.stringify([{...saved[0],matchday:{matches:[{id:'bad'}],footer:''}}])).length,0);
 const legacy={...draft,id:'legacy',matchday:undefined,title:'기존 공지',body:'기존 본문'};const [parsed]=parseDrafts(JSON.stringify([legacy]));assert.equal(parsed.matchday,undefined);assert.equal(parsed.body,'기존 본문');assert.doesNotThrow(()=>validateDraft(parsed));
});

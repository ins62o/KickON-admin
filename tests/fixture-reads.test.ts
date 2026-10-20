import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readFixtureRounds,readFixtures} from '../src/management/fixture-reads.ts';

function clientFor(pages:{data:unknown[]|null;error?:{message:string};count?:number}[]){
 const calls:unknown[][]=[];
 const client={from(table:string){calls.push(['from',table]);const query:Record<string,unknown>={then(resolve:(value:unknown)=>unknown){return Promise.resolve(pages.shift()??{data:[],count:0,error:null}).then(resolve);}};for(const method of ['select','eq','gte','lt','order','range','or','not','is'])query[method]=(...args:unknown[])=>{calls.push([method,...args]);return query;};return query;}} as unknown as SupabaseClient;
 return {client,calls};
}
const row=(round:number|null,kickoff_at:string,status='FINISHED',id=String(round))=>({id,round,kickoff_at,status,league_id:'kleague'});
const now=Date.parse('2026-10-20T00:00:00Z');
test('all leagues combine registered rounds and default to the earliest upcoming fixture without a league restriction',async()=>{
 const {client,calls}=clientFor([{data:[row(33,'2026-10-24T05:00:00Z','SCHEDULED'),{...row(7,'2026-10-20T05:00:00Z','LIVE'),league_id:'kleague2'}]}]);
 assert.deepEqual(await readFixtureRounds(client,'all',now),{rounds:[7,33],hasUnassigned:false,defaultRound:'33',summary:{total:2,scheduled:1,today:1,live:1}});
 assert.ok(!calls.some(call=>call[0]==='eq'&&call[1]==='league_id'));
 const all=clientFor([{data:[],count:0}]);await readFixtures(all.client,'all','all','2026-01-01','2026-12-31',1);assert.ok(!all.calls.some(call=>call[0]==='eq'&&['league_id','round'].includes(String(call[1]))));
});
test('round discovery reads the whole league season, sorts numeric rounds and defaults to the next actual fixture',async()=>{
 const {client,calls}=clientFor([{data:Array.from({length:500},(_,i)=>row(9,'2026-09-01T00:00:00Z','FINISHED',String(i)))},{data:[row(33,'2026-10-24T05:00:00Z','SCHEDULED'),row(10,'2026-10-01T00:00:00Z')]}]);
 assert.deepEqual(await readFixtureRounds(client,'kleague',now),{rounds:[9,10,33],hasUnassigned:false,defaultRound:'33',summary:{total:502,scheduled:1,today:0,live:0}});
 assert.ok(calls.some(call=>JSON.stringify(call)==='["range",500,999]'));assert.ok(calls.some(call=>JSON.stringify(call)==='["eq","league_id","kleague"]'));assert.ok(calls.some(call=>JSON.stringify(call)==='["gte","kickoff_at","2026-01-01T00:00:00+09:00"]'));assert.ok(calls.some(call=>JSON.stringify(call)==='["lt","kickoff_at","2027-01-01T00:00:00+09:00"]'));
});
test('next scheduled fixture takes precedence over live and past games, with explicit fallbacks',async()=>{
 const future=row(33,'2026-10-24T00:00:00Z','SCHEDULED'),live=row(32,'2026-10-19T00:00:00Z','LIVE');
 assert.equal((await readFixtureRounds(clientFor([{data:[future,live]}]).client,'kleague',now)).defaultRound,'33');
 assert.equal((await readFixtureRounds(clientFor([{data:[row(31,'2026-10-01T00:00:00Z','NS'),live]}]).client,'all',now)).defaultRound,'32');
 const earlier={...row(7,'2026-10-21T05:00:00Z','NS'),league_id:'kleague2'};
 assert.equal((await readFixtureRounds(clientFor([{data:[future,earlier,live]}]).client,'all',now)).defaultRound,'7');
 assert.deepEqual(await readFixtureRounds(clientFor([{data:[row(null,'2026-10-24T00:00:00Z','NS')]}]).client,'kleague',now),{rounds:[],hasUnassigned:true,defaultRound:'unassigned',summary:{total:1,scheduled:1,today:0,live:0}});
 assert.equal((await readFixtureRounds(clientFor([{data:[row(10,'2026-10-01T00:00:00Z'),row(9,'2026-09-01T00:00:00Z')]}]).client,'kleague',now)).defaultRound,'10');
 assert.deepEqual(await readFixtureRounds(clientFor([{data:[]}]).client,'kleague',now),{rounds:[],hasUnassigned:false,defaultRound:'all',summary:{total:0,scheduled:0,today:0,live:0}});
});
test('fixture reads apply league, team, round and server pagination without limiting a postponed round to its original week',async()=>{
 const fixture=row(12,'2026-10-24T05:00:00Z','SCHEDULED');const {client,calls}=clientFor([{data:[fixture],count:31}]);
 assert.equal((await readFixtures(client,'kleague','seoul','2026-01-01','2026-12-31',2,false,'12')).total,31);
 for(const expected of [['eq','round',12],['range',15,29],['or','home_team_id.eq.seoul,away_team_id.eq.seoul'],['lt','kickoff_at','2027-01-01T00:00:00+09:00']])assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(expected)));
 const missing=clientFor([{data:[],count:0}]);await readFixtures(missing.client,'kleague','all','2026-01-01','2026-12-31',1,false,'unassigned');assert.ok(missing.calls.some(call=>JSON.stringify(call)==='["is","round",null]'));
 const upcoming=clientFor([{data:[],count:0}]);await readFixtures(upcoming.client,'all','all','2026-10-20','2026-11-20',1,true);assert.ok(upcoming.calls.some(call=>call[0]==='not'&&call[1]==='status'));assert.ok(!upcoming.calls.some(call=>call[0]==='eq'&&call[1]==='round'));
});
test('round errors never become empty schedules and invalid filters do not dispatch',async()=>{
 await assert.rejects(readFixtureRounds(clientFor([{data:null,error:{message:'failed'}}]).client,'kleague',now),/불러오지 못/);
 await assert.rejects(readFixtureRounds(clientFor([{data:null}]).client,'kleague',now),/목록/);
 await assert.rejects(readFixtures(clientFor([{data:[]}]).client,'kleague','all','2026-01-01','2026-12-31',1),/건수/);
 await assert.rejects(readFixtureRounds(clientFor([{data:[{...row(1,'2026-10-24'),league_id:'kleague2'}]}]).client,'kleague',now),/리그/);
 for(const round of ['0','-1','1.5','foo','2147483648']){const {client,calls}=clientFor([]);await assert.rejects(readFixtures(client,'kleague','all','2026-01-01','2026-12-31',1,false,round),/라운드/);assert.equal(calls.length,0);}
 await assert.rejects(readFixtures(clientFor([]).client,'kleague','all','2026-02-30','2026-12-31',1),/종료일/);
});

test('season summary counts all registered matches, only future scheduled games and Korean calendar days',async()=>{
 const data=[row(1,'2026-10-19T14:59:00Z'),row(2,'2026-10-19T15:00:00Z'),row(3,'2026-10-20T14:59:00Z','NS'),row(4,'2026-10-20T15:00:00Z','SCHEDULED'),row(5,'2026-10-21T00:00:00Z','CANCELLED'),row(6,'2026-10-19T16:00:00Z','INPLAY_1ST_HALF'),row(7,'2026-10-19T17:00:00Z','NS')];
 const result=await readFixtureRounds(clientFor([{data}]).client,'all',now);
 assert.deepEqual(result.summary,{total:7,scheduled:2,today:4,live:1});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readClubPlayers,clubSummary,type ClubPlayer} from '../src/management/club-summary.ts';
import type {Catalogue} from '../src/management/model.ts';

const player=(team_id:string,player_id:string,patch:Partial<ClubPlayer>={}):ClubPlayer=>({season:2026,league_id:'kleague',team_id,player_id,player_name:'English Player',display_name:null,display_name_ko:null,data_source:'SPORTMONKS',...patch});
const catalogue:Catalogue={teams:['a','b','c','d','unknown'].map(id=>({id,name:id,short_name:id,code:id,sportmonks_id:null})),standings:['a','b','c','d'].map((team_id,index)=>({team_id,league_id:index<3?'kleague':'kleague2',season:2026,rank:1,points:0,played:0,won:0,drawn:0,lost:0,goals_for:0,goals_against:0,goal_difference:0,updated_at:''}))};
function clientFor(pages:{data:unknown;error?:{message:string}}[]){
 const calls:unknown[][]=[];
 const client={from(table:string){calls.push(['from',table]);const query:Record<string,unknown>={then(resolve:(value:unknown)=>unknown){return Promise.resolve(pages.shift()??{data:[],error:null}).then(resolve);}};for(const method of ['select','eq','order','range'])query[method]=(...args:unknown[])=>{calls.push([method,...args]);return query;};return query;}} as unknown as SupabaseClient;
 return {client,calls};
}
test('club cards follow the current standings and season, deduplicate player IDs and count only genuinely empty teams',()=>{
 const rows=[player('a','1'),player('b','1'),player('b','2',{display_name:'한글 이름'}),player('b','3',{data_source:'MANUAL'}),player('d','4',{league_id:'kleague2'}),player('unknown','5',{league_id:'other'}),player('c','6',{season:2025}),player('c','7',{league_id:'kleague2'})];
 assert.deepEqual(clubSummary(catalogue,rows,'all'),{teams:5,players:5,missingNames:3,emptyTeams:1,emptyTeamIds:['c'],missingNamePlayers:[rows[0],rows[4],rows[5]]});
 assert.deepEqual(clubSummary(catalogue,rows,'kleague'),{teams:3,players:3,missingNames:1,emptyTeams:1,emptyTeamIds:['c'],missingNamePlayers:[rows[0]]});
 assert.deepEqual(clubSummary(catalogue,rows,'kleague2'),{teams:1,players:1,missingNames:1,emptyTeams:0,emptyTeamIds:[],missingNamePlayers:[rows[4]]});
 assert.deepEqual(clubSummary(catalogue,rows,'unclassified'),{teams:1,players:1,missingNames:1,emptyTeams:0,emptyTeamIds:[],missingNamePlayers:[rows[5]]});
 assert.deepEqual(clubSummary(catalogue,[],'kleague'),{teams:3,players:0,missingNames:0,emptyTeams:3,emptyTeamIds:['a','b','c'],missingNamePlayers:[]});
});
test('club player totals read every season page with stable keys and only the fields needed for the cards',async()=>{
 const {client,calls}=clientFor([{data:Array.from({length:500},(_,i)=>player('a',String(i)))},{data:[player('b','500')]}]);
 assert.equal((await readClubPlayers(client)).length,501);
 for(const expected of [['eq','season',2026],['range',500,999],['order','league_id'],['order','team_id'],['order','player_id']])assert.ok(calls.some(call=>JSON.stringify(call)===JSON.stringify(expected)));
 assert.ok(!String(calls.find(call=>call[0]==='select')?.[1]).includes('date_of_birth'));
});
test('denied, incomplete or stale season reads never become successful zero or partial totals',async()=>{
 for(const data of [null,{},[player('a','1',{season:2025})],[{...player('a','1'),display_name_ko:undefined}]])await assert.rejects(readClubPlayers(clientFor([{data}]).client),/집계/);
 await assert.rejects(readClubPlayers(clientFor([{data:null,error:{message:'permission denied'}}]).client),/집계/);
 await assert.rejects(readClubPlayers(clientFor([{data:Array.from({length:500},(_,i)=>player('a',String(i)))},{data:null,error:{message:'failed'}}]).client),/집계/);
 assert.deepEqual(await readClubPlayers(clientFor([{data:[]}]).client),[]);
});

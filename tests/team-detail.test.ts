import test from 'node:test';
import assert from 'node:assert/strict';
import {readTeamPlayers,saveTeamPlayer,saveTeamProfile,playerPatch,needsKoreanName,playerName,playerPositionOptions,sortTeamPlayers,type TeamPlayer} from '../src/management/team-detail.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Team} from '../src/management/model.ts';
const player:TeamPlayer={season:2026,league_id:'kleague',team_id:'seoul',player_id:'100',player_name:'Player',display_name:null,display_name_ko:'선수',image_url:null,shirt_number:0,position:'Goalkeeper',detailed_position:null,appearances:0,goals:0,assists:0,height:null,weight:75,date_of_birth:'2000-01-02',in_squad:true,updated_at:'2026-10-20T00:00:00Z',data_source:'SPORTMONKS',manual_lock:false};
const team:Team={id:'seoul',name:'FC 서울',short_name:'서울',code:'SEO',sportmonks_id:1};
function playerForm(){const form=new FormData();for(const key of ['player_name','display_name_ko','shirt_number','position','detailed_position','appearances','goals','assists','height','weight','date_of_birth'] as const)form.set(key,String(player[key]??''));return form;}
function teamForm(){const form=new FormData();for(const key of ['name','short_name','code'] as const)form.set(key,team[key]);form.set('reason','구단 이름 확인');return form;}
test('player numeric sorts compare actual numbers, preserve zero and leave unknown values last in both directions',()=>{
 const rows=[{...player,player_id:'a',shirt_number:10,goals:2,assists:10,appearances:2},{...player,player_id:'b',shirt_number:2,goals:10,assists:2,appearances:10},{...player,player_id:'c',shirt_number:0,goals:0,assists:0,appearances:0},{...player,player_id:'d',shirt_number:null,goals:NaN,assists:NaN,appearances:NaN}];
 for(const [key,asc,desc] of [['shirt_number','cbad','abcd'],['goals','cabd','bacd'],['assists','cbad','abcd'],['appearances','cabd','bacd']] as const){
  assert.equal(sortTeamPlayers(rows,key,'asc').map(row=>row.player_id).join(''),asc);
  assert.equal(sortTeamPlayers(rows,key,'desc').map(row=>row.player_id).join(''),desc);
 }
 assert.equal(rows.map(row=>row.player_id).join(''),'abcd');
});
test('player name and position sorts use displayed Korean names and canonical position order across aliases',()=>{
 const rows=[{...player,player_id:'a',display_name_ko:'다',position:'MF'},{...player,player_id:'b',display_name_ko:'가',position:'Goalkeeper'},{...player,player_id:'c',display_name_ko:'나',position:'Defender'},{...player,player_id:'d',display_name_ko:'라',position:'Forward'},{...player,player_id:'e',display_name_ko:'마',position:null}];
 assert.equal(sortTeamPlayers(rows,'name','asc').map(row=>row.player_id).join(''),'bcade');
 assert.equal(sortTeamPlayers(rows,'name','desc').map(row=>row.player_id).join(''),'edacb');
 assert.equal(sortTeamPlayers(rows,'position','asc').map(row=>row.player_id).join(''),'bcade');
 assert.equal(sortTeamPlayers(rows,'position','desc').map(row=>row.player_id).join(''),'dacbe');
});
test('player squad sorting groups registered and excluded players with stable name and ID ties',()=>{
 const rows=[{...player,player_id:'10',in_squad:false},{...player,player_id:'2',in_squad:false},{...player,player_id:'1',in_squad:true}];
 assert.deepEqual(sortTeamPlayers(rows,'in_squad','desc').map(row=>row.player_id),['1','2','10']);
 assert.deepEqual(sortTeamPlayers(rows,'in_squad','asc').map(row=>row.player_id),['2','10','1']);
});
test('position choices use Korean labels and preserve existing aliases or missing values until changed',()=>{
 const options=playerPositionOptions('Goalkeeper');
 assert.deepEqual(options.map(({value,label})=>[value,label]),[['Goalkeeper','골키퍼'],['Defender','수비수'],['Midfielder','미드필더'],['Attacker','공격수']]);
 for(const position of ['GK','골키퍼','Forward','공격수']){const choices=playerPositionOptions(position);assert.equal(choices.length,4);assert.ok(choices.some(option=>option.value===position));}
 for(const position of [null,'Unknown']){const choices=playerPositionOptions(position);assert.equal(choices[0].value,position??'');assert.equal(choices[0].disabled,true);assert.equal(choices.filter(option=>!option.disabled).length,4);}
 const form=playerForm();form.set('position','Defender');assert.deepEqual(playerPatch(player,form),{position:'Defender'});
});
test('birth dates accept the displayed format without a trailing period and retain date validation',()=>{
 const form=playerForm();form.set('date_of_birth','2000. 01. 02');assert.deepEqual(playerPatch(player,form),{});
 form.set('date_of_birth','1998. 03. 20');assert.deepEqual(playerPatch(player,form),{date_of_birth:'1998-03-20'});
 for(const value of ['2026. 02. 30','1998. 03. 20.','1998.03','invalid']){form.set('date_of_birth',value);assert.throws(()=>playerPatch(player,form),/생년월일/);}
 form.set('date_of_birth','');assert.deepEqual(playerPatch(player,form),{date_of_birth:null});
});
test('name review uses the recorded provider and visible Korean name without inferring arrival dates',()=>{
 assert.equal(needsKoreanName(player),false);
 const english={...player,display_name_ko:null,display_name:'English Player'};
 assert.equal(needsKoreanName(english),true);
 assert.equal(needsKoreanName({...english,data_source:'MANUAL'}),false);
 assert.equal(needsKoreanName({...english,data_source:'UNKNOWN'}),false);
 assert.equal(needsKoreanName({...english,display_name:'기존 한글 이름'}),false);
 assert.equal(needsKoreanName({...english,display_name_ko:'English Name'}),true);
 assert.equal(needsKoreanName({...english,data_source:' sportmonks ',display_name_ko:'   '}),true);
 assert.equal(playerName({...english,display_name_ko:'   '}),'English Player');
});
test('player reads stay within the selected team, season and league, page fully and keep genuine zero shirt numbers',async()=>{
 const filters:unknown[]=[];let page=0;
 const client={from(name:string){assert.equal(name,'team_players');const q={select(){return q;},eq(...args:unknown[]){filters.push(args);return q;},order(){return q;},range(from:number,to:number){filters.push([from,to]);return q;},then(resolve:(value:unknown)=>unknown){return Promise.resolve(resolve({data:page++===0?Array.from({length:500},(_,i)=>({...player,player_id:String(i),shirt_number:i})):[],error:null}));}};return q;}} as unknown as SupabaseClient;
 const rows=await readTeamPlayers(client,'seoul','kleague');assert.equal(rows.length,500);assert.equal(rows[0].shirt_number,0);assert.ok(filters.some(row=>JSON.stringify(row)==='["season",2026]'));assert.ok(filters.some(row=>JSON.stringify(row)==='["team_id","seoul"]'));assert.ok(filters.some(row=>JSON.stringify(row)==='["league_id","kleague"]'));assert.ok(filters.some(row=>JSON.stringify(row)==='[500,999]'));
});
test('player editing supplies its audit reason automatically and sends only changed fields with immutable scope and version',async()=>{
 const form=playerForm();assert.deepEqual(playerPatch(player,form),{});form.set('shirt_number','12');form.set('height','180');
 let calls=0;const client={async rpc(name:string,args:Record<string,unknown>){calls++;assert.equal(name,'admin_save_team_player');assert.equal(args.p_reason,'관리자 선수 정보 수정');assert.equal(args.p_team_id,'seoul');assert.equal(args.p_expected_updated_at,player.updated_at);assert.deepEqual(args.p_patch,{shirt_number:12,height:180});return {data:{...player,shirt_number:12,height:180},error:null};}} as unknown as SupabaseClient;
 assert.equal((await saveTeamPlayer(client,player,form)).shirt_number,12);assert.equal(calls,1);
 await saveTeamPlayer(client,player,playerForm());assert.equal(calls,1);
});
test('invalid numbers and dates are rejected before sending mutations',async()=>{
 const client={rpc(){throw Error('must not dispatch');}} as unknown as SupabaseClient;
 for(const [key,value] of [['height','49'],['weight','301'],['shirt_number','-1'],['goals','1.5'],['appearances',''],['date_of_birth','2026-02-30']]){
  const form=playerForm();form.set(key,value);await assert.rejects(saveTeamPlayer(client,player,form),error=>error instanceof Error&&!error.message.includes('must not dispatch'));
 }
});
test('team editing protects identity and expected display values and rejects duplicate codes or unverifiable results',async()=>{
 const form=teamForm();form.set('name','서울 FC');let calls=0;
 const client={async rpc(name:string,args:Record<string,unknown>){calls++;assert.equal(name,'admin_update_team_profile');assert.deepEqual(args.p_expected,{name:team.name,short_name:team.short_name,code:team.code});assert.deepEqual(args.p_patch,{name:'서울 FC'});assert.equal(args.p_team_id,'seoul');return {data:{...team,name:'서울 FC'},error:null};}} as unknown as SupabaseClient;
 assert.equal((await saveTeamProfile(client,team,'kleague',form)).id,'seoul');assert.equal(calls,1);await saveTeamProfile(client,team,'kleague',teamForm());assert.equal(calls,1);
 const rejected={rpc:async()=>({data:null,error:{code:'23505',message:'duplicate'}})} as unknown as SupabaseClient;await assert.rejects(saveTeamProfile(rejected,team,'kleague',form),/이미 사용 중/);
 const wrong={rpc:async()=>({data:{...team,id:'other'},error:null})} as unknown as SupabaseClient;await assert.rejects(saveTeamProfile(wrong,team,'kleague',form),/저장 결과/);
});
test('stale and failed roster responses are errors rather than empty or successful data',async()=>{
 const stale={rpc:async()=>({data:null,error:{message:'PLAYER_CONFLICT'}})} as unknown as SupabaseClient;const form=playerForm();form.set('player_name','Changed');await assert.rejects(saveTeamPlayer(stale,player,form),/정보가 변경/);
 const failed={from(){const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},then(resolve:(value:unknown)=>unknown){return Promise.resolve(resolve({data:null,error:{message:'network failure'}}));}};return q;}} as unknown as SupabaseClient;
 await assert.rejects(readTeamPlayers(failed,'seoul','kleague'),/처리하지 못/);
});

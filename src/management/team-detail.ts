import type {SupabaseClient} from '@supabase/supabase-js';
import {SEASON,type Team} from './model.ts';

export type TeamPlayer={season:number;league_id:string;team_id:string;player_id:string;player_name:string;display_name:string|null;display_name_ko:string|null;image_url:string|null;shirt_number:number|null;position:string|null;detailed_position:string|null;appearances:number;goals:number;assists:number;height:number|null;weight:number|null;date_of_birth:string|null;in_squad:boolean;updated_at:string;data_source:string;manual_lock:boolean};
type PlayerName=Pick<TeamPlayer,'display_name_ko'|'display_name'|'player_name'>;
export const playerName=(player:PlayerName)=>[player.display_name_ko,player.display_name,player.player_name].find(value=>value?.trim())?.trim()??'';
const source=(player:Pick<TeamPlayer,'data_source'>)=>player.data_source?.trim().toUpperCase()??'';
export const needsKoreanName=(player:PlayerName&Pick<TeamPlayer,'data_source'>)=>source(player)==='SPORTMONKS'&&!/\p{Script=Hangul}/u.test(playerName(player));
const positionNames:Record<string,string>={Goalkeeper:'골키퍼',Defender:'수비수',Midfielder:'미드필더',Attacker:'공격수',Forward:'공격수',GK:'골키퍼',DF:'수비수',MF:'미드필더',FW:'공격수'};
export const positionLabel=(position:string|null)=>positionNames[position??'']??position??'미확인';
export type PlayerSortKey='name'|'shirt_number'|'position'|'appearances'|'goals'|'assists'|'in_squad';
export function sortTeamPlayers(players:TeamPlayer[],key:PlayerSortKey,direction:'asc'|'desc'){
 const text=(a:string,b:string)=>a.localeCompare(b,'ko',{numeric:true});
 const entry=(player:TeamPlayer)=>{
  if(key==='name')return playerName(player)||null;
  if(key==='position')return player.position?.trim()?positionLabel(player.position):null;
  const value=key==='in_squad'?Number(player.in_squad):player[key];
  return typeof value==='number'&&Number.isFinite(value)?value:null;
 };
 const positions=['골키퍼','수비수','미드필더','공격수'];
 const rank=(position:string)=>positions.includes(position)?positions.indexOf(position):positions.length;
 return [...players].sort((a,b)=>{
  const left=entry(a),right=entry(b);
  if(left===null||right===null){if(left!==right)return left===null?1:-1;}
  const order=typeof left==='number'&&typeof right==='number'?left-right:typeof left==='string'&&typeof right==='string'?(key==='position'?rank(left)-rank(right):0)||text(left,right):0;
  return order*(direction==='asc'?1:-1)||text(playerName(a),playerName(b))||text(a.player_id,b.player_id)||text(a.league_id,b.league_id);
 });
}
export function playerPositionOptions(position:string|null){
 const options=['Goalkeeper','Defender','Midfielder','Attacker'].map(value=>({value:position&&positionLabel(position)===positionLabel(value)?position:value,label:positionLabel(value),disabled:false}));
 return options.some(option=>option.value===position)?options:[{value:position??'',label:positionLabel(position),disabled:true},...options];
}
const fields='season,league_id,team_id,player_id,player_name,display_name,display_name_ko,image_url,shirt_number,position,detailed_position,appearances,goals,assists,height,weight,date_of_birth,in_squad,updated_at,data_source,manual_lock';
function check(error:{message:string;code?:string}|null){
 if(!error)return;
 if(/CONFLICT/.test(error.message))throw Error('정보가 변경됐어요 새로 불러온 뒤 다시 수정해 주세요');
 if(error.code==='23505')throw Error('이미 사용 중인 구단 코드예요 다른 코드를 입력해 주세요');
 if(/REQUIRED|permission|denied/i.test(error.message))throw Error('정보를 수정할 권한이 없거나 필수 정보가 누락됐어요');
 if(/NOT_FOUND/.test(error.message))throw Error('선수 또는 구단 정보를 다시 불러와 주세요');
 if(/KOREAN_NAME/.test(error.message))throw Error('이 선수의 한글 이름은 비울 수 없어요');
 throw Error('정보를 처리하지 못했어요 다시 시도해 주세요');
}
export async function readTeamPlayers(client:SupabaseClient,teamId:string,league:string|null):Promise<TeamPlayer[]>{
 const rows:TeamPlayer[]=[];
 for(let from=0;;from+=500){
  let query=client.from('team_players').select(fields).eq('season',SEASON).eq('team_id',teamId).order('player_id').range(from,from+499);
  if(league)query=query.eq('league_id',league);
  const result=await query;check(result.error);const page=(result.data??[]) as TeamPlayer[];
  if(page.some(player=>player.team_id!==teamId||player.season!==SEASON||league&&player.league_id!==league))throw Error('선수단 범위를 확인하지 못했어요');
  rows.push(...page);if(page.length<500)break;
 }
 return rows.sort((a,b)=>Number(b.in_squad)-Number(a.in_squad)||(a.shirt_number??Infinity)-(b.shirt_number??Infinity)||playerName(a).localeCompare(playerName(b),'ko'));
}
const reasonValue=(form:FormData)=>{const value=String(form.get('reason')??'').trim();if(value.length<3||value.length>1000)throw Error('변경 사유를 3~1,000자로 입력해 주세요');return value;};
const textValue=(form:FormData,key:string,label:string,max:number,required=false)=>{const value=String(form.get(key)??'').trim();if(value.length>max||required&&!value)throw Error(`${label}을 확인해 주세요`);return value||null;};
const numericValue=(form:FormData,key:string,label:string,min:number,max:number,required=false)=>{const value=String(form.get(key)??'').trim();if(!value&&!required)return null;if(!/^\d+$/.test(value)||!Number.isInteger(Number(value))||Number(value)<min||Number(value)>max)throw Error(`${label}에 ${min}~${max} 사이 정수를 입력해 주세요`);return Number(value);};
export const birthDateValue=(value:string)=>value.trim().replace(/^(\d{4})\.\s*(\d{2})\.\s*(\d{2})$/,'$1-$2-$3');
export function playerPatch(player:TeamPlayer,form:FormData){
 const values:Record<string,unknown>={player_name:textValue(form,'player_name','선수 이름',160,true),display_name_ko:textValue(form,'display_name_ko','한글 이름',160),position:textValue(form,'position','포지션',160),detailed_position:textValue(form,'detailed_position','세부 포지션',160),shirt_number:numericValue(form,'shirt_number','등번호',0,999),height:numericValue(form,'height','키',50,300),weight:numericValue(form,'weight','몸무게',20,300),appearances:numericValue(form,'appearances','출전',0,9999,true),goals:numericValue(form,'goals','득점',0,9999,true),assists:numericValue(form,'assists','도움',0,9999,true)};
 const birth=birthDateValue(String(form.get('date_of_birth')??''));
 if(birth&&(!/^\d{4}-\d{2}-\d{2}$/.test(birth)||!Number.isFinite(Date.parse(birth))||new Date(birth).toISOString().slice(0,10)!==birth||birth<'1900-01-01'||birth>new Date().toISOString().slice(0,10)))throw Error('생년월일을 확인해 주세요');
 values.date_of_birth=birth||null;
 return Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==player[key as keyof TeamPlayer]));
}
export async function saveTeamPlayer(client:SupabaseClient,player:TeamPlayer,form:FormData){
 const reason='관리자 선수 정보 수정',patch=playerPatch(player,form);
 if(!Object.keys(patch).length)return player;
 const result=await client.rpc('admin_save_team_player',{p_team_id:player.team_id,p_player_id:player.player_id,p_season:player.season,p_league_id:player.league_id,p_expected_updated_at:player.updated_at,p_patch:patch,p_reason:reason});check(result.error);
 const saved=result.data as TeamPlayer|null;
 if(!saved||saved.player_id!==player.player_id||saved.team_id!==player.team_id||saved.season!==player.season||saved.league_id!==player.league_id||!saved.updated_at)throw Error('저장 결과를 확인하지 못했어요 다시 불러와 주세요');
 return saved;
}
export async function saveTeamProfile(client:SupabaseClient,team:Team,league:string,form:FormData){
 const reason=reasonValue(form),name=textValue(form,'name','구단 이름',120,true)!,short_name=textValue(form,'short_name','구단 약칭',60,true)!,code=textValue(form,'code','구단 코드',16,true)!;
 if(!/^[a-zA-Z0-9_-]+$/.test(code))throw Error('구단 코드는 영문·숫자·밑줄·하이픈으로 입력해 주세요');
 const expected={name:team.name,short_name:team.short_name,code:team.code};
 const patch=Object.fromEntries(Object.entries({name,short_name,code}).filter(([key,value])=>value!==expected[key as keyof typeof expected]));
 if(!Object.keys(patch).length)return team;
 const result=await client.rpc('admin_update_team_profile',{p_team_id:team.id,p_season:SEASON,p_league_id:league,p_expected:expected,p_patch:patch,p_reason:reason});check(result.error);
 const saved=result.data as Team|null;if(!saved||saved.id!==team.id||!saved.name||!saved.short_name||!saved.code)throw Error('저장 결과를 확인하지 못했어요 다시 불러와 주세요');
 return saved;
}

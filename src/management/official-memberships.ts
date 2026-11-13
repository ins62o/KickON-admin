import type {SupabaseClient} from '@supabase/supabase-js';

type Source = {kind:string; url:string; sha256:string};
type Player = {
  operation_id:string; player_id:string; official_player_id:string; name:string; date_of_birth:string;
  from_team_id:string; from_league_id:string; to_team_id:string; to_league_id:string;
  expected_updated_at:string; verified_at:string; shirt_number:number;
  stats:{appearances:number; goals:number; assists:number};
  sources:Source[];
};
type Bundle = {season:number; reason:string; players:Player[]};
type Receipt = {player_id:string; operation_id:string; status:'applied'|'already_applied'};

const hasOnly=(value:object,keys:string[])=>Object.keys(value).every(key=>keys.includes(key));
const id=/^[1-9][0-9]{0,15}$/;
const club=/^[a-z][a-z0-9-]{0,60}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const league=(value:string)=>['kleague','kleague2'].includes(value);
const integer=(value:unknown,max:number)=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=max;
const textMatches=(value:unknown,pattern:RegExp)=>typeof value==='string'&&pattern.test(value);

export function parseOfficialMemberships(input:string,season:number):Bundle {
  if(input.length>150_000)throw Error('선수단 확인 자료가 너무 커요');
  let bundle:Bundle;
  try{bundle=JSON.parse(input);}catch{throw Error('선수단 확인 자료의 JSON 형식을 확인해 주세요');}
  if(!bundle||bundle.season!==season)throw Error('선수단 확인 자료의 시즌을 확인해 주세요');
  if(!hasOnly(bundle,['season','reason','players'])||typeof bundle.reason!=='string'||bundle.reason.trim().length<3||bundle.reason.length>500||
    !Array.isArray(bundle.players)||bundle.players.length<1||bundle.players.length>29)throw Error('변경 사유와 선수 1~29명의 확인 자료가 필요해요');

  for(const [index,row] of bundle.players.entries()){
    if(!row||!hasOnly(row,['operation_id','player_id','official_player_id','name','date_of_birth','from_team_id','from_league_id','to_team_id','to_league_id','expected_updated_at','verified_at','shirt_number','stats','sources'])||
      !textMatches(row.operation_id,uuid)||!textMatches(row.player_id,id)||!textMatches(row.official_player_id,id)||
      typeof row.name!=='string'||!row.name.trim()||row.name.length>100||!textMatches(row.date_of_birth,/^\d{4}-\d\d-\d\d$/)||
      !textMatches(row.from_team_id,club)||!textMatches(row.to_team_id,club)||row.from_team_id===row.to_team_id||
      !league(row.from_league_id)||!league(row.to_league_id)||
      ![row.expected_updated_at,row.verified_at].every(value=>typeof value==='string'&&Number.isFinite(Date.parse(value)))||
      !integer(row.shirt_number,999)||!row.stats||!hasOnly(row.stats,['appearances','goals','assists'])||
      ![row.stats.appearances,row.stats.goals,row.stats.assists].every(value=>integer(value,999))||
      !Array.isArray(row.sources)||row.sources.length<2||row.sources.length>5||
      !row.sources.every(source=>source&&hasOnly(source,['kind','url','sha256'])&&
        ['player_profile','current_squad','season_statistics','match_records'].includes(source.kind)&&
        textMatches(source.url,/^https:\/\/(www\.)?kleague\.com\/[^\s]*$/)&&source.url.length<=400&&
        textMatches(source.sha256,/^[0-9a-f]{64}$/))||
      !['player_profile','current_squad'].every(kind=>row.sources.some(source=>source.kind===kind))||
      !row.sources.some(source=>source.kind==='season_statistics'||source.kind==='match_records')){
      throw Error(`${index+1}번째 선수의 소속 또는 공식 확인 자료를 확인해 주세요`);
    }
  }
  for(const key of ['player_id','official_player_id','operation_id'] as const){
    if(new Set(bundle.players.map(row=>row[key])).size!==bundle.players.length)throw Error('중복된 선수 또는 요청이 있어요');
  }
  return bundle;
}

export async function applyOfficialMemberships(client:SupabaseClient,bundle:Bundle):Promise<Receipt[]> {
  const {data,error}=await client.rpc('admin_apply_official_memberships',{p_batch:bundle});
  if(error){
    const [code,id]=error.message.split(': ');
    const player=bundle.players.find(row=>row.player_id===id)?.name;
    const prefix=player? `${player} 선수 · `:'';
    const messages:Record<string,string>={
      CANONICAL_SUPER_ADMIN_REQUIRED:'소속을 변경할 수 있는 관리자 계정으로 로그인해 주세요',
      OFFICIAL_MEMBERSHIP_SOURCE_CHANGED:'현재 선수단 정보가 바뀌었어요. 확인 자료를 다시 만들어 주세요',
      OFFICIAL_MEMBERSHIP_DESTINATION_CONFLICT:'새 구단의 저장된 시즌 기록을 다시 대조해 주세요',
      OFFICIAL_MEMBERSHIP_MULTIPLE_CURRENT:'현재 소속이 두 곳 이상이에요. 선수단 기록을 확인해 주세요',
      OFFICIAL_CONFLICT:'K리그 공식 확인 자료를 새로 확인해 주세요',
      IDENTITY_CONFLICT:'선수 식별 정보나 생년월일을 다시 확인해 주세요',
      MANUAL_LOCK_CONFLICT:'기존 관리자 수정 내용을 먼저 확인해 주세요',
    };
    throw Error(prefix+(messages[code]||'소속 변경을 저장하지 못했어요. 다시 시도해 주세요'));
  }
  if(!Array.isArray(data)||data.length!==bundle.players.length)throw Error('소속 변경 결과를 확인해 주세요');
  return data;
}

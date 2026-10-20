import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectPostMatchRows} from '../supabase/functions/_shared/postMatchScope.ts';

type Scope={league_id:'kleague'|'kleague2';generation:number;fixtures:Record<string,unknown>[]};
export function retryScopeId(requestId:string,environment:string,league:string){
 const hex=createHash('sha256').update(`${environment}:${requestId}:${league}`).digest('hex').slice(0,32);
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function retryPostMatch(client:SupabaseClient,actor:string,environment:string,requestId:unknown,token:string|undefined,fetcher:typeof fetch=fetch){
 if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))throw Error('재시도 요청 정보를 확인해 주세요');
 if(!token)throw Error('스포츠 API 연결 설정이 필요해요');
 const {data,error}=await client.rpc('admin_post_match_retry_scope');
 if(error||!Array.isArray(data)||data.length>2)throw Error('재시도 대상 상태를 확인하지 못했어요');
 const scopes=data as Scope[];
 if(scopes.some(scope=>!['kleague','kleague2'].includes(scope.league_id)||!Number.isSafeInteger(scope.generation)||!Array.isArray(scope.fixtures)||scope.fixtures.length>1000)||new Set(scopes.map(scope=>scope.league_id)).size!==scopes.length)throw Error('재시도 범위를 확인하지 못했어요');
 if(!scopes.length)return {status:'no_target',message:'현재 재시도할 오류가 없어요 상태를 새로 확인했어요'};
 // Inspect every league before changing any blocked state.
 await Promise.all(scopes.map(async scope=>{
  const season=scope.league_id==='kleague'?26894:27443,league=scope.league_id==='kleague'?1034:1362;
  const response=await fetcher(`https://api.sportmonks.com/v3/football/seasons/${season}?include=fixtures.state;fixtures.participants;fixtures.scores`,{headers:{Authorization:token,Accept:'application/json'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error('공급자 경기 상태를 확인하지 못해 재시도하지 않았어요');
  const payload=await response.json();
  if(payload.data?.id!==season||payload.data?.league_id!==league||!Array.isArray(payload.data?.fixtures))throw Error('공급자 시즌 범위가 맞지 않아 재시도하지 않았어요');
  const rows=scope.fixtures.map(expected=>{
   const fixture=payload.data.fixtures.find((row:{id:number})=>row.id===expected.sportmonks_id);
   const raw=fixture?.state?.developer_name??fixture?.state?.short_name??fixture?.state?.state;
   const participants=fixture?.participants??[];
   const home=participants.find((p:{id:number;meta?:{location?:string}})=>p.id===expected.home_provider_id&&p.meta?.location==='home');
   const away=participants.find((p:{id:number;meta?:{location?:string}})=>p.id===expected.away_provider_id&&p.meta?.location==='away');
   if(!home||!away)throw Error('경기와 구단 연결을 확인해야 해요 재시도하지 않았어요');
   const score=(participant:{id:number;meta:{location:string}})=>{const scores=(fixture.scores??[]).filter((s:{participant_id:number;score?:{participant?:string}})=>s.participant_id===participant.id||s.score?.participant===participant.meta.location);return (scores.find((s:{description:string})=>s.description==='CURRENT')??scores.at(-1))?.score?.goals;};
   return {...expected,status:'FINISHED',_historyProviderState:raw,home_score:score(home),away_score:score(away)};
  });
  try{selectPostMatchRows(rows,scope.fixtures);}catch{throw Error('공급자 종료 상태·스코어 또는 실시간 처리 완료를 확인해야 해요 차단을 유지했어요');}
 }));
 const results=[];
 for(const scope of scopes){
  const {data:receipt,error:queueError}=await client.rpc('admin_request_post_match_retry',{p_actor:actor,p_environment:environment,p_request_id:retryScopeId(requestId,environment,scope.league_id),p_league:scope.league_id,p_generation:scope.generation,p_fixture_ids:scope.fixtures.map(f=>String(f.id)).sort()});
  if(queueError||!['queued','already_requested'].includes(receipt?.status))results.push({league:scope.league_id,status:'not_queued'});
  else results.push({league:scope.league_id,status:receipt.status,runId:receipt.run_id});
 }
 return {status:results.some(r=>r.status==='not_queued')?'partial':'queued',results,message:results.some(r=>r.status==='not_queued')?'일부 재시도 요청을 접수하지 못했어요 실행 내역과 현재 상태를 확인해 주세요':'재시도를 요청했어요 실제 처리가 완료되면 상태가 자동으로 바뀝니다'};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {selectPostMatchRows} from '../supabase/functions/_shared/postMatchScope.ts';
import {retryPostMatch,retryScopeId} from '../server/post-match-retry.ts';
const now=Date.parse('2026-10-20T12:00:00Z');
const expected={id:'finished',sportmonks_id:1,league_id:'kleague',home_team_id:'home',away_team_id:'away',home_provider_id:10,away_provider_id:20,status:'FINISHED',provider_status:'FINISHED',post_match_synced_at:null,post_match_sync_due_at:'2026-10-18T12:00:00Z'};
const row={...expected,_historyProviderState:'FT',home_score:2,away_score:1};
test('post-match rows exclude live, future, already repaired and unrelated season fixtures',()=>{
 const snapshots=[expected,{...expected,id:'live',status:'LIVE'},{...expected,id:'future',status:'SCHEDULED'},{...expected,id:'done',post_match_synced_at:'2026-10-19T12:00:00Z'},{...expected,id:'notdue',post_match_sync_due_at:'2026-10-21T00:00:00Z'}];
 assert.deepEqual(selectPostMatchRows([row,{...row,id:'live',_historyProviderState:'INPLAY_2ND_HALF'},{...row,id:'future',status:'SCHEDULED',_historyProviderState:'NS'}],snapshots,now),[row]);
});
test('post-match guard conditions stay strict and pending provider/live handoff is retryable',()=>{
 for(const raw of ['NS','INPLAY_PENALTIES','SUSPENDED','PENDING','AWARDED',null])assert.throws(()=>selectPostMatchRows([{...row,_historyProviderState:raw}],[expected],now),/CRON46_RETRY/);
 assert.throws(()=>selectPostMatchRows([row],[{...expected,provider_status:'LIVE'}],now),/CRON46_RETRY/);
 assert.throws(()=>selectPostMatchRows([{...row,home_team_id:'another'}],[expected],now),/IDENTITY_REVIEW/);
 assert.throws(()=>selectPostMatchRows([{...row,home_score:null}],[expected],now),/INVALID_RESULT/);
 assert.throws(()=>selectPostMatchRows([],[],now),/NO_DUE/);
 assert.throws(()=>selectPostMatchRows([row,row],[expected],now),/DUPLICATE/);
});
const request='11111111-1111-4111-8111-111111111111';
test('retry request IDs are stable per environment and league',()=>{
 assert.equal(retryScopeId(request,'production','kleague'),retryScopeId(request,'production','kleague'));
 assert.notEqual(retryScopeId(request,'production','kleague'),retryScopeId(request,'development','kleague'));
 assert.notEqual(retryScopeId(request,'production','kleague'),retryScopeId(request,'production','kleague2'));
});
function fixture(raw='FT'){
 const calls:string[]=[];
 const client={rpc:async(name:string,args?:Record<string,unknown>)=>{
  calls.push(name);if(name==='admin_post_match_retry_scope')return {data:[{league_id:'kleague',generation:2,fixtures:[expected]}],error:null};
  assert.equal(args?.p_actor,'actor');assert.deepEqual(args?.p_fixture_ids,['finished']);return {data:{status:'queued',run_id:'run'},error:null};
 }} as unknown as SupabaseClient;
 const fetcher=(async(input:unknown,options?:RequestInit)=>{assert.ok(String(input).startsWith('https://api.sportmonks.com/'));assert.equal((options?.headers as Record<string,string>).Authorization,'provider-private');return Response.json({data:{id:26894,league_id:1034,fixtures:[{id:1,state:{developer_name:raw},participants:[{id:10,meta:{location:'home'}},{id:20,meta:{location:'away'}}],scores:[{participant_id:10,description:'CURRENT',score:{goals:2}},{participant_id:20,description:'CURRENT',score:{goals:1}}]}]}});}) as typeof fetch;
 return {client,calls,fetcher};
}
test('provider recheck precedes the guarded enqueue and never claims completed work',async()=>{
 const f=fixture();const result=await retryPostMatch(f.client,'actor','production',request,'provider-private',f.fetcher);
 assert.equal(result.status,'queued');assert.deepEqual(f.calls,['admin_post_match_retry_scope','admin_request_post_match_retry']);
 assert.ok(!JSON.stringify(result).includes('provider-private'));
});
test('a missing provider result or invalid request never resets blocked state',async()=>{
 const f=fixture('INPLAY_2ND_HALF');await assert.rejects(retryPostMatch(f.client,'actor','production',request,'provider-private',f.fetcher),/차단을 유지/);
 assert.deepEqual(f.calls,['admin_post_match_retry_scope']);
 await assert.rejects(retryPostMatch(f.client,'actor','production','bad','provider-private',f.fetcher));assert.equal(f.calls.length,1);
});

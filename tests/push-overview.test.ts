import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readPushOverview} from '../src/management/push-settings.ts';
const data={checked_at:'2026-10-20T05:00:00Z',day_start:'2026-10-19T15:00:00Z',day_end:'2026-10-20T15:00:00Z',total_users:15,enabled_users:10,disabled_users:4,unknown_users:1,today_succeeded:20,today_failed:2,pending:3,lineup_enabled_users:6,match_enabled_users:8,community_enabled_users:4,match_partial_users:1};
const client=(value:unknown,error:unknown=null)=>({rpc(name:string){assert.equal(name,'get_admin_push_overview');return {abortSignal(signal:AbortSignal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({data:value,error});}};}} as unknown as SupabaseClient);
test('push overview keeps real counts, missing preferences and zero failures distinct',async()=>{
 assert.deepEqual(await readPushOverview(client(data)),data);
 const empty={...data,total_users:0,enabled_users:0,disabled_users:0,unknown_users:0,today_succeeded:0,today_failed:0,pending:0,lineup_enabled_users:0,match_enabled_users:0,community_enabled_users:0,match_partial_users:0};assert.deepEqual(await readPushOverview(client(empty)),empty);
});
test('overview rejects failed or incomplete counts and invalid Korean-day boundaries instead of showing zeros',async()=>{
 for(const value of [null,{}, {...data,total_users:16},{...data,enabled_users:-1},{...data,today_failed:null},{...data,unknown_users:undefined},{...data,today_failed:0.5},{...data,today_succeeded:undefined},{...data,pending:null},{...data,pending:-1},{...data,match_enabled_users:undefined},{...data,lineup_enabled_users:11},{...data,community_enabled_users:-1},{...data,match_partial_users:11},{...data,checked_at:'invalid'},{...data,checked_at:data.day_end},{...data,day_start:'2026-10-20T00:00:00Z'},{...data,day_end:'2026-10-21T15:00:00Z'}])await assert.rejects(readPushOverview(client(value)),/집계를 확인할 수 없어요/);
 await assert.rejects(readPushOverview(client(data,{message:'denied'})),/집계를 확인할 수 없어요/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readPushSettings} from '../src/management/push-settings.ts';
const settings={checked_at:'2026-10-20T06:00:00Z',global_disabled:false,max_attempts:5,base_retry_delay_seconds:5,max_retry_delay_seconds:300,notifications:['MATCH','LINEUP','COMMUNITY','ATTENDANCE','SYSTEM'].map(type=>({type,domain:type==='SYSTEM'?null:type==='MATCH'||type==='LINEUP'?'MATCH':'COMMUNITY',mode:type==='SYSTEM'?'SHADOW':'FULL'}))};
const client=(data:unknown,error:unknown=null)=>({rpc(name:string){assert.equal(name,'get_admin_push_settings');return {abortSignal:async()=>({data,error})};}} as unknown as SupabaseClient);
test('push settings use effective per-type modes and preserve unconnected types',async()=>{
 assert.deepEqual(await readPushSettings(client(settings)),settings);
 const dev={...settings,notifications:settings.notifications.map(row=>({...row,domain:row.type==='ATTENDANCE'?null:row.domain,mode:'SHADOW'}))};
 assert.deepEqual(await readPushSettings(client(dev)),dev);
});
test('push settings reject denied, missing and incomplete configurations instead of inventing enabled or disabled values',async()=>{
 for(const value of [null,{}, {...settings,global_disabled:undefined},{...settings,max_attempts:0},{...settings,base_retry_delay_seconds:500},{...settings,notifications:[]},{...settings,notifications:settings.notifications.map(()=>settings.notifications[0])},{...settings,notifications:settings.notifications.map(row=>({...row,mode:'UNKNOWN'}))},{...settings,global_disabled:true}])await assert.rejects(readPushSettings(client(value)),/확인할 수 없어요/);
 await assert.rejects(readPushSettings(client(settings,{message:'denied'})),/확인할 수 없어요/);
 const stopped={...settings,global_disabled:true,notifications:settings.notifications.map(row=>({...row,mode:'OFF'}))};
 assert.deepEqual(await readPushSettings(client(stopped)),stopped);
});

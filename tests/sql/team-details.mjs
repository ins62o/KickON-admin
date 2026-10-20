// Run with PGLITE_MODULE_PATH pointing to a temporary @electric-sql/pglite install.
// Fixtures replace only pre-existing auth, scope, audit and player-editor dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE_PATH||'@electric-sql/pglite');
const migration=await fs.readFile(new URL('../../supabase/migrations/202610200003_admin_team_details.sql',import.meta.url),'utf8');
for(const canonical of [false,true]){
 const db=new PGlite();
 await db.exec(`
 create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('qa.actor',true),'')::uuid$$;
 create function public.admin_has_capability(text) returns boolean language sql as $$select coalesce(current_setting('qa.can_write',true),'false')='true'$$;
 create table public.teams(id text primary key,name text not null,short_name text not null,code text not null unique,sportmonks_id integer);
 create function public.admin_assert_football_scope(integer,text,text) returns void language plpgsql as $$begin if $1<>2026 or $2 not in ('kleague','kleague2') or ($3 is not null and not exists(select 1 from public.teams where id=$3)) then raise exception 'INVALID_SCOPE';end if;end$$;
 create table public.manual_overrides(id bigint generated always as identity,entity_type text,entity_id text,season integer,league_id text,field_path text,original_value jsonb,override_value jsonb,reason text,blocks_sync boolean,created_by uuid,released_at timestamptz,expires_at timestamptz,updated_at timestamptz default now());
 create unique index overrides_active on public.manual_overrides(entity_type,entity_id,season,league_id,field_path) where released_at is null;
 create table public.team_players(team_id text,player_id text,season integer,league_id text,player_name text,appearances integer,goals integer,assists integer,height integer,updated_at timestamptz,primary key(season,league_id,player_id));
 create table public.qa_audit(action text,details jsonb);create table public.qa_locks(season integer,player_id text);
 create function public.data_center_write_audit(text,text,text,jsonb,jsonb,text) returns void language plpgsql as $$begin if current_setting('qa.audit_fail',true)='true' then raise exception 'AUDIT_FAILED';end if;insert into public.qa_audit values($1,$5);end$$;
 create function public.admin_update_player_details(text,integer,text,jsonb,text) returns integer language plpgsql as $$begin
 if length(trim($5))<3 then raise exception 'INVALID_REASON';end if;
 if not ($4 ?& array['appearances','goals','assists']) or exists(select 1 from jsonb_object_keys($4) field where field not in ('height','appearances','goals','assists')) then raise exception 'INVALID_PATCH';end if;
 update public.team_players set height=coalesce(($4->>'height')::integer,height),appearances=($4->>'appearances')::integer,goals=($4->>'goals')::integer,assists=($4->>'assists')::integer,updated_at=clock_timestamp() where player_id=$1 and season=$2 and league_id=$3;
 insert into public.qa_audit values('PLAYER_EDITOR',$4);return 1;end$$;
 insert into public.teams values('seoul','FC 서울','서울','SEO',672),('suwon','수원 삼성','수원','SUW',1);
 insert into public.team_players values('seoul','100',2026,'kleague','Player',10,0,2,180,'2026-10-20T00:00:00Z'),('seoul','100',2025,'kleague','Player',1,1,1,180,'2025-10-20T00:00:00Z');
 select set_config('qa.actor','11111111-1111-1111-1111-111111111111',false),set_config('qa.can_write','true',false);
 `);
 if(canonical)await db.exec(`create function canonical_membership_lock(integer,text) returns void language sql as $$insert into public.qa_locks values($1,$2)$$;`);
 await db.exec(migration);
 const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const team=async()=> (await query('select * from public.teams where id=$1',['seoul']))[0];
 const snapshot=async()=>{const row=await team();return {name:row.name,short_name:row.short_name,code:row.code};};
 const update=async(patch,expected,reason='표기 정보 보정')=>query('select admin_update_team_profile($1,2026,$2,$3,$4,$5) result',['seoul','kleague',expected??await snapshot(),patch,reason]);
 const initial=await snapshot();
 await assert.rejects(update({id:'hijack'}),/INVALID_TEAM_FIELD/);
 await assert.rejects(update({code:'잘못된 코드'}),/INVALID_TEAM_CODE/);
 await assert.rejects(update({name:' '}),/INVALID_TEAM_FIELD/);
 await db.exec("set role anon");await assert.rejects(update({name:'거부'},initial),/permission denied/);await db.exec('reset role');
 await db.exec("select set_config('qa.can_write','false',false)");await assert.rejects(update({name:'거부'}),/ADMIN_PERMISSION_REQUIRED/);await db.exec("select set_config('qa.can_write','true',false)");
 await assert.rejects(query("select admin_update_team_profile('seoul',2026,'bad',$1,'{\"name\":\"거부\"}','사유 입력')",[initial]),/INVALID_SCOPE/);
 await update({name:'FC 서울 수정'});assert.equal((await team()).name,'FC 서울 수정');assert.equal((await team()).sportmonks_id,672);
 assert.equal((await query('select * from public.manual_overrides')).length,1);assert.equal((await query('select * from public.qa_audit')).length,1);
 await assert.rejects(update({short_name:'새 약칭'},initial),/TEAM_CONFLICT/);
 await db.exec("update public.teams set name='Provider reset',short_name='서울 약칭' where id='seoul'");assert.equal((await team()).name,'FC 서울 수정');assert.equal((await team()).short_name,'서울 약칭');
 await update({name:'FC 서울 수정'});assert.equal((await query('select * from public.qa_audit')).length,1);
 await assert.rejects(update({code:'SUW'}),/duplicate key/);assert.equal((await team()).code,'SEO');assert.equal((await query('select * from public.manual_overrides')).length,1);
 await db.exec("select set_config('qa.audit_fail','true',false)");await assert.rejects(update({short_name:'실패한 수정'}),/AUDIT_FAILED/);assert.equal((await team()).short_name,'서울 약칭');assert.equal((await query('select * from public.manual_overrides')).length,1);await db.exec("select set_config('qa.audit_fail','false',false)");
 await db.exec("update public.manual_overrides set released_at=now();update public.teams set name='Provider released' where id='seoul'");assert.equal((await team()).name,'Provider released');
 const save=async(teamId='seoul',version='2026-10-20T00:00:00Z',patch={height:185})=>query('select admin_save_team_player($1,$2,2026,$3,$4,$5,$6) result',[teamId,'100','kleague',version,patch,'선수 정보 보정']);
 await assert.rejects(save('suwon'),/PLAYER_NOT_FOUND/);await assert.rejects(save('seoul','2026-10-19T00:00:00Z'),/PLAYER_CONFLICT/);await assert.rejects(save('seoul',undefined,{team_id:'suwon'}),/INVALID_PLAYER_UPDATE/);
 await db.exec('truncate public.qa_locks');const [saved]=await save();assert.equal(saved.result.height,185);assert.equal(saved.result.goals,0);
 assert.deepEqual((await query("select details from public.qa_audit where action='PLAYER_EDITOR'"))[0].details,{height:185,appearances:10,goals:0,assists:2});
 assert.deepEqual(await query('select * from public.qa_locks'),canonical?[{season:2025,player_id:'100'},{season:2026,player_id:'100'}]:[]);
 await assert.rejects(save(),/PLAYER_CONFLICT/);assert.equal((await query("select height from public.team_players where season=2025"))[0].height,180);
 await db.close();console.log(`PASS team detail SQL guards, audit rollback, override protection and player delegation (${canonical?'production membership locks':'older development schema'})`);
}

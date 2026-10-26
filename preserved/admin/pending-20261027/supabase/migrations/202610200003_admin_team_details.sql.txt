begin;
create or replace function public.protect_team_profile_overrides()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
 for item in select field_path,override_value from public.manual_overrides
  where entity_type='team' and entity_id=new.id and released_at is null and blocks_sync
    and (expires_at is null or expires_at>now()) and field_path in ('name','short_name','code')
  order by updated_at,id
 loop
  if jsonb_typeof(item.override_value)='string' then
   new:=jsonb_populate_record(new,jsonb_build_object(item.field_path,item.override_value));
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.protect_team_profile_overrides() from public,anon,authenticated;
drop trigger if exists teams_protect_profile_overrides on public.teams;
create trigger teams_protect_profile_overrides before insert or update on public.teams for each row execute function public.protect_team_profile_overrides();

create or replace function public.admin_update_team_profile(p_team_id text,p_season integer,p_league_id text,p_expected jsonb,p_patch jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); before_team public.teams%rowtype; after_team public.teams%rowtype; current_values jsonb; entry record; normalized_reason text:=btrim(coalesce(p_reason,''));
begin
 if actor is null or not public.admin_has_capability('data.write') then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;
 perform public.admin_assert_football_scope(p_season,p_league_id,p_team_id);
 if char_length(normalized_reason) not between 3 and 1000 or p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'INVALID_TEAM_UPDATE'; end if;
 if exists(select 1 from jsonb_each(p_patch) where key not in ('name','short_name','code') or jsonb_typeof(value)<>'string' or char_length(btrim(value#>>'{}'))<1 or char_length(btrim(value#>>'{}'))>case key when 'name' then 120 when 'short_name' then 60 else 16 end) then raise exception 'INVALID_TEAM_FIELD'; end if;
 if p_patch?'code' and (p_patch->>'code') !~ '^[A-Za-z0-9_-]{1,16}$' then raise exception 'INVALID_TEAM_CODE'; end if;
 select * into before_team from public.teams where id=p_team_id for update;
 if not found then raise exception 'TEAM_NOT_FOUND'; end if;
 current_values:=jsonb_build_object('name',before_team.name,'short_name',before_team.short_name,'code',before_team.code);
 if current_values is distinct from p_expected then raise exception 'TEAM_CONFLICT'; end if;
 for entry in select key,btrim(value#>>'{}') as value from jsonb_each(p_patch)
 loop
  if current_values->>entry.key is not distinct from entry.value then continue; end if;
  insert into public.manual_overrides(entity_type,entity_id,season,league_id,field_path,original_value,override_value,reason,blocks_sync,created_by)
  values('team',p_team_id,p_season,p_league_id,entry.key,current_values->entry.key,to_jsonb(entry.value),normalized_reason,true,actor)
  on conflict(entity_type,entity_id,season,league_id,field_path) where released_at is null
  do update set override_value=excluded.override_value,reason=excluded.reason,blocks_sync=true,expires_at=null,updated_at=now();
 end loop;
 if current_values=(current_values||p_patch) then return to_jsonb(before_team); end if;
 update public.teams set name=coalesce(btrim(p_patch->>'name'),name),short_name=coalesce(btrim(p_patch->>'short_name'),short_name),code=coalesce(btrim(p_patch->>'code'),code)
 where id=p_team_id returning * into after_team;
 perform public.data_center_write_audit('TEAM_PROFILE_UPDATED','team',p_team_id,current_values,jsonb_build_object('name',after_team.name,'short_name',after_team.short_name,'code',after_team.code),normalized_reason);
 return to_jsonb(after_team);
end $$;

create or replace function public.admin_save_team_player(p_team_id text,p_player_id text,p_season integer,p_league_id text,p_expected_updated_at timestamptz,p_patch jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_player public.team_players%rowtype; identity record; saved jsonb;
begin
 if (select auth.uid()) is null or not public.admin_has_capability('data.write') then raise exception 'ADMIN_PERMISSION_REQUIRED'; end if;
 perform public.admin_assert_football_scope(p_season,p_league_id,p_team_id);
 if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or p_patch?'team_id' or p_expected_updated_at is null then raise exception 'INVALID_PLAYER_UPDATE'; end if;
 -- Current production membership locks must precede row locks; older development schemas have no membership lock function.
 if to_regprocedure('public.canonical_membership_lock(integer,text)') is not null then
  for identity in select p_season as season,btrim(p_player_id) as player_id union select season,player_id from public.team_players where player_id=btrim(p_player_id) order by season,player_id
  loop execute 'select public.canonical_membership_lock($1,$2)' using identity.season,identity.player_id; end loop;
 end if;
 select * into current_player from public.team_players where season=p_season and league_id=p_league_id and team_id=p_team_id and player_id=p_player_id for update;
 if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
 if current_player.updated_at is distinct from p_expected_updated_at then raise exception 'PLAYER_CONFLICT'; end if;
 -- The existing audited editor requires all three stats. Fill unchanged stats from the locked row, never a stale browser snapshot.
 perform public.admin_update_player_details(p_player_id,p_season,p_league_id,jsonb_build_object('appearances',current_player.appearances,'goals',current_player.goals,'assists',current_player.assists)||p_patch,p_reason);
 select to_jsonb(player) into saved from public.team_players player where player.season=p_season and player.league_id=p_league_id and player.team_id=p_team_id and player.player_id=p_player_id;
 return saved;
end $$;

revoke all on function public.admin_update_team_profile(text,integer,text,jsonb,jsonb,text),public.admin_save_team_player(text,text,integer,text,timestamptz,jsonb,text) from public,anon;
grant execute on function public.admin_update_team_profile(text,integer,text,jsonb,jsonb,text),public.admin_save_team_player(text,text,integer,text,timestamptz,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;

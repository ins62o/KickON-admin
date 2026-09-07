begin;

-- 선수 상세 화면의 직접 수정에 필요한 최소 운영 테이블입니다.
-- 다른 운영/신고 마이그레이션이 없어도 이 파일만 독립적으로 실행할 수 있습니다.
create table if not exists public.manual_overrides (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('team', 'player', 'fixture', 'standing', 'ranking')
  ),
  entity_id text not null,
  season integer not null default 2026,
  league_id text not null default 'kleague',
  field_path text not null,
  original_value jsonb,
  override_value jsonb not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  blocks_sync boolean not null default true,
  created_by uuid not null references public.admin_users(user_id) on delete restrict,
  released_by uuid references public.admin_users(user_id) on delete set null,
  released_at timestamptz,
  release_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((released_at is null and released_by is null) or released_at is not null)
);

alter table public.manual_overrides
  add column if not exists season integer not null default 2026,
  add column if not exists league_id text not null default 'kleague';

create index if not exists manual_overrides_entity_idx
  on public.manual_overrides (entity_type, entity_id, created_at desc);

drop index if exists public.manual_overrides_active_field_idx;
create unique index manual_overrides_active_field_idx
  on public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path
  )
  where released_at is null;

-- 직접 수정한 필드는 이후 SportsMonks 동기화에서도 유지합니다.
create or replace function public.protect_team_player_manual_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_override record;
begin
  for active_override in
    select override.field_path, override.override_value
    from public.manual_overrides override
    where override.entity_type = 'player'
      and override.entity_id = new.player_id
      and override.season = new.season
      and override.league_id = new.league_id
      and override.released_at is null
  loop
    case active_override.field_path
      when 'team_id' then
        new.team_id := active_override.override_value #>> '{}';
      when 'player_name' then
        new.player_name := active_override.override_value #>> '{}';
        new.display_name := active_override.override_value #>> '{}';
      when 'display_name_ko' then
        new.display_name_ko := active_override.override_value #>> '{}';
      when 'shirt_number' then
        new.shirt_number := (active_override.override_value #>> '{}')::integer;
      when 'position' then
        new.position := active_override.override_value #>> '{}';
      when 'detailed_position' then
        new.detailed_position := active_override.override_value #>> '{}';
      when 'appearances' then
        new.appearances := (active_override.override_value #>> '{}')::integer;
      when 'goals' then
        new.goals := (active_override.override_value #>> '{}')::integer;
      when 'assists' then
        new.assists := (active_override.override_value #>> '{}')::integer;
      when 'height' then
        new.height := (active_override.override_value #>> '{}')::integer;
      when 'weight' then
        new.weight := (active_override.override_value #>> '{}')::integer;
      when 'date_of_birth' then
        new.date_of_birth := (active_override.override_value #>> '{}')::date;
      when 'in_squad' then
        new.in_squad := (active_override.override_value #>> '{}')::boolean;
      else null;
    end case;
  end loop;
  return new;
end;
$$;

drop trigger if exists team_players_protect_manual_overrides
  on public.team_players;
create trigger team_players_protect_manual_overrides
  before insert or update on public.team_players
  for each row execute function public.protect_team_player_manual_overrides();

-- 선수 기본정보와 시즌 기록을 한 번에 갱신하고 변경 필드만 보호합니다.
create or replace function public.admin_update_player_details(
  p_player_id text,
  p_season integer,
  p_league_id text,
  p_patch jsonb,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_player_id text := trim(coalesce(p_player_id, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  current_row jsonb;
  field_name text;
  changed_count integer := 0;
begin
  if current_actor is null
    or not public.admin_has_capability('data.write')
  then
    raise exception 'PLAYER_EDITOR_REQUIRED';
  end if;

  if char_length(normalized_player_id) not between 1 and 80
    or normalized_player_id !~ '^[a-zA-Z0-9_-]+$'
    or char_length(normalized_league_id) not between 1 and 160
    or p_season not between 2000 and 2200
    or char_length(normalized_reason) not between 3 and 1000
    or p_patch is null
    or jsonb_typeof(p_patch) <> 'object'
    or p_patch = '{}'::jsonb
  then
    raise exception 'INVALID_PLAYER_UPDATE';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as patch_field(name)
    where patch_field.name not in (
      'team_id', 'player_name', 'display_name_ko', 'shirt_number', 'position',
      'detailed_position', 'appearances', 'goals', 'assists',
      'height', 'weight', 'date_of_birth'
    )
  ) then
    raise exception 'UNSUPPORTED_PLAYER_FIELD';
  end if;

  if p_patch ? 'team_id' and (
    jsonb_typeof(p_patch -> 'team_id') <> 'string'
    or char_length(trim(coalesce(p_patch ->> 'team_id', ''))) not between 1 and 160
    or not exists (
      select 1 from public.teams team
      where team.id = trim(p_patch ->> 'team_id')
    )
  ) then
    raise exception 'INVALID_PLAYER_TEAM';
  end if;

  if p_patch ? 'player_name' and (
    jsonb_typeof(p_patch -> 'player_name') <> 'string'
    or char_length(trim(coalesce(p_patch ->> 'player_name', ''))) not between 1 and 160
  ) then
    raise exception 'INVALID_PLAYER_NAME';
  end if;

  if p_patch ? 'display_name_ko'
    and p_patch -> 'display_name_ko' <> 'null'::jsonb
    and (
      jsonb_typeof(p_patch -> 'display_name_ko') <> 'string'
      or char_length(trim(coalesce(p_patch ->> 'display_name_ko', ''))) > 160
    )
  then
    raise exception 'INVALID_PLAYER_KOREAN_NAME';
  end if;

  if p_patch ? 'shirt_number'
    and p_patch -> 'shirt_number' <> 'null'::jsonb
    and (
      jsonb_typeof(p_patch -> 'shirt_number') <> 'number'
      or (p_patch ->> 'shirt_number') !~ '^[0-9]+$'
      or (p_patch ->> 'shirt_number')::integer not between 0 and 999
    )
  then
    raise exception 'INVALID_SHIRT_NUMBER';
  end if;

  foreach field_name in array array['position', 'detailed_position']
  loop
    if p_patch ? field_name
      and p_patch -> field_name <> 'null'::jsonb
      and (
        jsonb_typeof(p_patch -> field_name) <> 'string'
        or char_length(trim(coalesce(p_patch ->> field_name, ''))) > 160
      )
    then
      raise exception 'INVALID_PLAYER_TEXT_FIELD';
    end if;
  end loop;

  foreach field_name in array array['appearances', 'goals', 'assists']
  loop
    if not (p_patch ? field_name)
      or p_patch -> field_name = 'null'::jsonb
      or jsonb_typeof(p_patch -> field_name) <> 'number'
      or (p_patch ->> field_name) !~ '^[0-9]+$'
      or (p_patch ->> field_name)::integer not between 0 and 9999
    then
      raise exception 'INVALID_PLAYER_STAT';
    end if;
  end loop;

  if p_patch ? 'height'
    and p_patch -> 'height' <> 'null'::jsonb
    and (
      jsonb_typeof(p_patch -> 'height') <> 'number'
      or (p_patch ->> 'height') !~ '^[0-9]+$'
      or (p_patch ->> 'height')::integer not between 50 and 300
    )
  then
    raise exception 'INVALID_PLAYER_HEIGHT';
  end if;

  if p_patch ? 'weight'
    and p_patch -> 'weight' <> 'null'::jsonb
    and (
      jsonb_typeof(p_patch -> 'weight') <> 'number'
      or (p_patch ->> 'weight') !~ '^[0-9]+$'
      or (p_patch ->> 'weight')::integer not between 20 and 300
    )
  then
    raise exception 'INVALID_PLAYER_WEIGHT';
  end if;

  if p_patch ? 'date_of_birth'
    and p_patch -> 'date_of_birth' <> 'null'::jsonb
  then
    if jsonb_typeof(p_patch -> 'date_of_birth') <> 'string'
      or (p_patch ->> 'date_of_birth') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    then
      raise exception 'INVALID_PLAYER_BIRTH_DATE';
    end if;
    begin
      perform (p_patch ->> 'date_of_birth')::date;
    exception when others then
      raise exception 'INVALID_PLAYER_BIRTH_DATE';
    end;
  end if;

  select to_jsonb(player)
  into current_row
  from public.team_players player
  where player.player_id = normalized_player_id
    and player.season = p_season
    and player.league_id = normalized_league_id
  for update;

  if current_row is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  for field_name in select jsonb_object_keys(p_patch)
  loop
    if current_row -> field_name is not distinct from p_patch -> field_name then
      continue;
    end if;

    insert into public.manual_overrides (
      entity_type, entity_id, season, league_id, field_path,
      original_value, override_value, reason, blocks_sync, created_by
    ) values (
      'player', normalized_player_id, p_season, normalized_league_id,
      field_name, current_row -> field_name, p_patch -> field_name,
      normalized_reason, true, current_actor
    )
    on conflict (
      entity_type, entity_id, season, league_id, field_path
    ) where released_at is null
    do update set
      override_value = excluded.override_value,
      reason = excluded.reason,
      blocks_sync = true,
      updated_at = now();

    changed_count := changed_count + 1;
  end loop;

  if changed_count = 0 then
    return 0;
  end if;

  update public.team_players player set
    team_id = case when p_patch ? 'team_id'
      then trim(p_patch ->> 'team_id') else player.team_id end,
    player_name = case when p_patch ? 'player_name'
      then trim(p_patch ->> 'player_name') else player.player_name end,
    display_name = case when p_patch ? 'player_name'
      then trim(p_patch ->> 'player_name') else player.display_name end,
    display_name_ko = case when p_patch ? 'display_name_ko'
      then nullif(trim(coalesce(p_patch ->> 'display_name_ko', '')), '') else player.display_name_ko end,
    shirt_number = case when p_patch ? 'shirt_number'
      then (p_patch ->> 'shirt_number')::integer else player.shirt_number end,
    position = case when p_patch ? 'position'
      then nullif(trim(coalesce(p_patch ->> 'position', '')), '') else player.position end,
    detailed_position = case when p_patch ? 'detailed_position'
      then nullif(trim(coalesce(p_patch ->> 'detailed_position', '')), '') else player.detailed_position end,
    appearances = case when p_patch ? 'appearances'
      then (p_patch ->> 'appearances')::integer else player.appearances end,
    goals = case when p_patch ? 'goals'
      then (p_patch ->> 'goals')::integer else player.goals end,
    assists = case when p_patch ? 'assists'
      then (p_patch ->> 'assists')::integer else player.assists end,
    height = case when p_patch ? 'height'
      then (p_patch ->> 'height')::integer else player.height end,
    weight = case when p_patch ? 'weight'
      then (p_patch ->> 'weight')::integer else player.weight end,
    date_of_birth = case when p_patch ? 'date_of_birth'
      then (p_patch ->> 'date_of_birth')::date else player.date_of_birth end,
    updated_at = now()
  where player.player_id = normalized_player_id
    and player.season = p_season
    and player.league_id = normalized_league_id;

  return changed_count;
end;
$$;

create or replace function public.release_player_manual_override(
  p_override_id uuid,
  p_release_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
begin
  if current_actor is null
    or not public.admin_has_capability('data.write')
  then
    raise exception 'PLAYER_EDITOR_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_release_reason, ''))) not between 3 and 1000 then
    raise exception 'INVALID_RELEASE_REASON';
  end if;

  update public.manual_overrides override set
    released_by = current_actor,
    released_at = now(),
    release_reason = trim(p_release_reason),
    blocks_sync = false,
    updated_at = now()
  where override.id = p_override_id
    and override.entity_type = 'player'
    and override.released_at is null;

  return found;
end;
$$;

alter table public.manual_overrides enable row level security;

drop policy if exists "data center operators read overrides"
  on public.manual_overrides;
create policy "data center operators read overrides"
  on public.manual_overrides for select to authenticated
  using (public.admin_has_capability('data.read'));

revoke all on table public.manual_overrides from public, anon;
grant select on table public.manual_overrides to authenticated;
grant all on table public.manual_overrides to service_role;

revoke all on function public.protect_team_player_manual_overrides()
  from public, anon, authenticated;
revoke all on function public.admin_update_player_details(
  text, integer, text, jsonb, text
) from public, anon;
revoke all on function public.release_player_manual_override(uuid, text)
  from public, anon;

grant execute on function public.admin_update_player_details(
  text, integer, text, jsonb, text
) to authenticated, service_role;
grant execute on function public.release_player_manual_override(uuid, text)
  to authenticated, service_role;

commit;

-- Supabase REST가 새 테이블과 RPC를 즉시 인식하도록 스키마 캐시를 갱신합니다.
notify pgrst, 'reload schema';

-- 두 값이 모두 true면 선수 상세 수정 준비가 끝난 것입니다.
select
  to_regclass('public.manual_overrides') is not null as override_table_ready,
  to_regprocedure(
    'public.admin_update_player_details(text,integer,text,jsonb,text)'
  ) is not null as update_rpc_ready;

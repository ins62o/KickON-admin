-- KICKON Data Center: player change detection and protected field overrides.
-- Apply after 202609050001_admin_operations.sql.

alter table public.manual_overrides
  add column if not exists season integer not null default 2026,
  add column if not exists league_id text not null default 'kleague';

drop index if exists public.manual_overrides_active_field_idx;
create unique index if not exists manual_overrides_active_field_idx
  on public.manual_overrides (entity_type, entity_id, season, league_id, field_path)
  where released_at is null;

create table if not exists public.player_squad_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null references public.teams(id) on delete cascade,
  season integer not null,
  league_id text not null,
  source text not null default 'SportsMonks',
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  row_count integer not null default 0 check (row_count >= 0),
  captured_at timestamptz not null default now()
);

create index if not exists player_squad_snapshots_lookup_idx
  on public.player_squad_snapshots (team_id, season, league_id, captured_at desc);

create table if not exists public.player_squad_snapshot_rows (
  snapshot_id uuid not null references public.player_squad_snapshots(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  display_name_ko text,
  shirt_number integer,
  position text,
  detailed_position text,
  in_squad boolean not null,
  captured_value jsonb not null default '{}',
  primary key (snapshot_id, player_id)
);

create index if not exists player_squad_snapshot_rows_player_idx
  on public.player_squad_snapshot_rows (player_id, snapshot_id);

create table if not exists public.player_change_events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  player_id text not null,
  player_name text not null,
  from_team_id text references public.teams(id) on delete set null,
  to_team_id text references public.teams(id) on delete set null,
  change_type text not null check (change_type in (
    'squad_added', 'transfer', 'loan_in', 'loan_out', 'loan_return',
    'released', 'contract_expired', 'squad_removed',
    'shirt_number_change', 'position_change', 'unknown'
  )),
  field_path text,
  before_value jsonb,
  after_value jsonb,
  movement_date date,
  detected_at timestamptz not null default now(),
  source text not null default 'SportsMonks snapshot',
  source_reference text,
  db_reflected boolean not null default true,
  review_status text not null default 'detected' check (review_status in ('detected', 'reviewing', 'applied', 'ignored')),
  reviewed_by uuid references public.admin_users(user_id) on delete set null,
  resolution_note text,
  reflected_at timestamptz default now(),
  previous_snapshot_id uuid references public.player_squad_snapshots(id) on delete set null,
  current_snapshot_id uuid references public.player_squad_snapshots(id) on delete set null,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists player_change_events_queue_idx
  on public.player_change_events (review_status, detected_at desc);
create index if not exists player_change_events_player_idx
  on public.player_change_events (player_id, detected_at desc);
create index if not exists player_change_events_teams_idx
  on public.player_change_events (to_team_id, from_team_id, detected_at desc);

comment on table public.player_squad_snapshots is
  '선수단 동기화 전후의 안정된 DB 상태. sync-team-squad의 전체 비활성화 중간 상태는 캡처하지 않는다.';
comment on table public.player_change_events is
  '스냅샷 간 선수단·등번호·포지션 차이와 운영자 검토 상태. 이적/임대 세부 유형은 운영자가 확인한다.';

create or replace function public.capture_player_squad_snapshot(
  p_team_id text,
  p_season integer default 2026,
  p_league_id text default 'kleague',
  p_source text default 'SportsMonks',
  p_sync_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_snapshot uuid;
  current_snapshot uuid;
  captured_count integer;
begin
  if not public.is_admin('operator') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  if p_team_id is null or p_team_id = '' or p_season < 2000 or p_season > 2200 then
    raise exception 'INVALID_SNAPSHOT_TARGET';
  end if;

  select snapshot.id into previous_snapshot
  from public.player_squad_snapshots snapshot
  where snapshot.team_id = p_team_id
    and snapshot.season = p_season
    and snapshot.league_id = p_league_id
  order by snapshot.captured_at desc
  limit 1;

  insert into public.player_squad_snapshots (team_id, season, league_id, source, sync_run_id)
  values (p_team_id, p_season, p_league_id, left(coalesce(nullif(p_source, ''), 'SportsMonks'), 120), p_sync_run_id)
  returning id into current_snapshot;

  insert into public.player_squad_snapshot_rows (
    snapshot_id, player_id, player_name, display_name_ko, shirt_number,
    position, detailed_position, in_squad, captured_value
  )
  select
    current_snapshot, player.player_id, player.player_name, player.display_name_ko,
    player.shirt_number, player.position, player.detailed_position, player.in_squad,
    jsonb_build_object(
      'team_id', player.team_id,
      'display_name_ko', player.display_name_ko,
      'shirt_number', player.shirt_number,
      'position', player.position,
      'detailed_position', player.detailed_position,
      'in_squad', player.in_squad,
      'updated_at', player.updated_at
    )
  from public.team_players player
  where player.team_id = p_team_id
    and player.season = p_season
    and player.league_id = p_league_id;

  get diagnostics captured_count = row_count;
  update public.player_squad_snapshots set row_count = captured_count where id = current_snapshot;

  if previous_snapshot is null then
    return current_snapshot;
  end if;

  insert into public.player_change_events (
    dedupe_key, player_id, player_name, from_team_id, to_team_id, change_type,
    field_path, before_value, after_value, detected_at, source,
    previous_snapshot_id, current_snapshot_id, sync_run_id
  )
  select
    md5(concat_ws('|', previous_snapshot::text, current_snapshot::text, current_row.player_id, 'squad_added')),
    current_row.player_id,
    current_row.player_name,
    null,
    p_team_id,
    'squad_added',
    'in_squad',
    to_jsonb(coalesce(previous_row.in_squad, false)),
    'true'::jsonb,
    now(),
    left(coalesce(nullif(p_source, ''), 'SportsMonks snapshot'), 120),
    previous_snapshot,
    current_snapshot,
    p_sync_run_id
  from public.player_squad_snapshot_rows current_row
  left join public.player_squad_snapshot_rows previous_row
    on previous_row.snapshot_id = previous_snapshot and previous_row.player_id = current_row.player_id
  where current_row.snapshot_id = current_snapshot
    and current_row.in_squad
    and coalesce(previous_row.in_squad, false) = false
  on conflict (dedupe_key) do nothing;

  insert into public.player_change_events (
    dedupe_key, player_id, player_name, from_team_id, to_team_id, change_type,
    field_path, before_value, after_value, detected_at, source,
    previous_snapshot_id, current_snapshot_id, sync_run_id
  )
  select
    md5(concat_ws('|', previous_snapshot::text, current_snapshot::text, previous_row.player_id, 'squad_removed')),
    previous_row.player_id,
    previous_row.player_name,
    p_team_id,
    null,
    'squad_removed',
    'in_squad',
    'true'::jsonb,
    'false'::jsonb,
    now(),
    left(coalesce(nullif(p_source, ''), 'SportsMonks snapshot'), 120),
    previous_snapshot,
    current_snapshot,
    p_sync_run_id
  from public.player_squad_snapshot_rows previous_row
  left join public.player_squad_snapshot_rows current_row
    on current_row.snapshot_id = current_snapshot and current_row.player_id = previous_row.player_id
  where previous_row.snapshot_id = previous_snapshot
    and previous_row.in_squad
    and coalesce(current_row.in_squad, false) = false
  on conflict (dedupe_key) do nothing;

  insert into public.player_change_events (
    dedupe_key, player_id, player_name, from_team_id, to_team_id, change_type,
    field_path, before_value, after_value, detected_at, source,
    previous_snapshot_id, current_snapshot_id, sync_run_id
  )
  select
    md5(concat_ws('|', previous_snapshot::text, current_snapshot::text, current_row.player_id, 'shirt_number', previous_row.shirt_number::text, current_row.shirt_number::text)),
    current_row.player_id,
    current_row.player_name,
    p_team_id,
    p_team_id,
    'shirt_number_change',
    'shirt_number',
    to_jsonb(previous_row.shirt_number),
    to_jsonb(current_row.shirt_number),
    now(),
    left(coalesce(nullif(p_source, ''), 'SportsMonks snapshot'), 120),
    previous_snapshot,
    current_snapshot,
    p_sync_run_id
  from public.player_squad_snapshot_rows current_row
  join public.player_squad_snapshot_rows previous_row
    on previous_row.snapshot_id = previous_snapshot and previous_row.player_id = current_row.player_id
  where current_row.snapshot_id = current_snapshot
    and current_row.in_squad and previous_row.in_squad
    and current_row.shirt_number is distinct from previous_row.shirt_number
  on conflict (dedupe_key) do nothing;

  insert into public.player_change_events (
    dedupe_key, player_id, player_name, from_team_id, to_team_id, change_type,
    field_path, before_value, after_value, detected_at, source,
    previous_snapshot_id, current_snapshot_id, sync_run_id
  )
  select
    md5(concat_ws('|', previous_snapshot::text, current_snapshot::text, current_row.player_id, 'position', previous_row.position, current_row.position)),
    current_row.player_id,
    current_row.player_name,
    p_team_id,
    p_team_id,
    'position_change',
    'position',
    to_jsonb(previous_row.position),
    to_jsonb(current_row.position),
    now(),
    left(coalesce(nullif(p_source, ''), 'SportsMonks snapshot'), 120),
    previous_snapshot,
    current_snapshot,
    p_sync_run_id
  from public.player_squad_snapshot_rows current_row
  join public.player_squad_snapshot_rows previous_row
    on previous_row.snapshot_id = previous_snapshot and previous_row.player_id = current_row.player_id
  where current_row.snapshot_id = current_snapshot
    and current_row.in_squad and previous_row.in_squad
    and current_row.position is distinct from previous_row.position
  on conflict (dedupe_key) do nothing;

  return current_snapshot;
end;
$$;

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
      when 'display_name_ko' then new.display_name_ko := active_override.override_value #>> '{}';
      when 'shirt_number' then new.shirt_number := (active_override.override_value #>> '{}')::integer;
      when 'position' then new.position := active_override.override_value #>> '{}';
      when 'detailed_position' then new.detailed_position := active_override.override_value #>> '{}';
      when 'in_squad' then new.in_squad := (active_override.override_value #>> '{}')::boolean;
      else null;
    end case;
  end loop;
  return new;
end;
$$;

drop trigger if exists team_players_protect_manual_overrides on public.team_players;
create trigger team_players_protect_manual_overrides
  before insert or update on public.team_players
  for each row execute function public.protect_team_player_manual_overrides();

create or replace function public.apply_player_manual_override(
  p_player_id text,
  p_season integer,
  p_league_id text,
  p_field_path text,
  p_override_value jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  current_row jsonb;
  target_override uuid;
begin
  if not public.is_admin('admin') or current_actor is null then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_field_path not in ('display_name_ko', 'shirt_number', 'position', 'detailed_position', 'in_squad') then
    raise exception 'UNSUPPORTED_OVERRIDE_FIELD';
  end if;
  if p_override_value is null or char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 1000 then
    raise exception 'INVALID_OVERRIDE';
  end if;

  select to_jsonb(player) into current_row
  from public.team_players player
  where player.player_id = p_player_id
    and player.season = p_season
    and player.league_id = p_league_id
  for update;
  if current_row is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  ) values (
    'player', p_player_id, p_season, p_league_id, p_field_path,
    current_row -> p_field_path, p_override_value, trim(p_reason), true, current_actor
  )
  on conflict (entity_type, entity_id, season, league_id, field_path) where released_at is null
  do update set
    override_value = excluded.override_value,
    reason = excluded.reason,
    blocks_sync = true,
    updated_at = now()
  returning id into target_override;

  update public.team_players player set
    display_name_ko = case when p_field_path = 'display_name_ko' then p_override_value #>> '{}' else player.display_name_ko end,
    shirt_number = case when p_field_path = 'shirt_number' then (p_override_value #>> '{}')::integer else player.shirt_number end,
    position = case when p_field_path = 'position' then p_override_value #>> '{}' else player.position end,
    detailed_position = case when p_field_path = 'detailed_position' then p_override_value #>> '{}' else player.detailed_position end,
    in_squad = case when p_field_path = 'in_squad' then (p_override_value #>> '{}')::boolean else player.in_squad end,
    updated_at = now()
  where player.player_id = p_player_id
    and player.season = p_season
    and player.league_id = p_league_id;

  return target_override;
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
  if not public.is_admin('admin') or current_actor is null then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_release_reason, ''))) < 3 or char_length(p_release_reason) > 1000 then
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

drop trigger if exists player_change_events_set_updated_at on public.player_change_events;
create trigger player_change_events_set_updated_at
  before update on public.player_change_events
  for each row execute function public.set_admin_updated_at();
drop trigger if exists player_change_events_audit on public.player_change_events;
create trigger player_change_events_audit
  after insert or update or delete on public.player_change_events
  for each row execute function public.record_admin_audit_log();

alter table public.player_squad_snapshots enable row level security;
alter table public.player_squad_snapshot_rows enable row level security;
alter table public.player_change_events enable row level security;

drop policy if exists "admins read squad snapshots" on public.player_squad_snapshots;
create policy "admins read squad snapshots" on public.player_squad_snapshots
  for select to authenticated using (public.is_admin('viewer'));
drop policy if exists "admins read squad snapshot rows" on public.player_squad_snapshot_rows;
create policy "admins read squad snapshot rows" on public.player_squad_snapshot_rows
  for select to authenticated using (public.is_admin('viewer'));
drop policy if exists "admins read player changes" on public.player_change_events;
create policy "admins read player changes" on public.player_change_events
  for select to authenticated using (public.is_admin('viewer'));
drop policy if exists "operators update player changes" on public.player_change_events;
create policy "operators update player changes" on public.player_change_events
  for update to authenticated using (public.is_admin('operator')) with check (public.is_admin('operator'));

revoke insert, update, delete on table public.manual_overrides from authenticated;
revoke all on table public.player_squad_snapshots, public.player_squad_snapshot_rows, public.player_change_events from public, anon;
grant select on table public.player_squad_snapshots, public.player_squad_snapshot_rows, public.player_change_events to authenticated;
grant update on table public.player_change_events to authenticated;
grant all on table public.player_squad_snapshots, public.player_squad_snapshot_rows, public.player_change_events to service_role;

revoke all on function public.capture_player_squad_snapshot(text,integer,text,text,uuid) from public, anon;
revoke all on function public.apply_player_manual_override(text,integer,text,text,jsonb,text) from public, anon;
revoke all on function public.release_player_manual_override(uuid,text) from public, anon;
revoke all on function public.protect_team_player_manual_overrides() from public, anon, authenticated;
grant execute on function public.capture_player_squad_snapshot(text,integer,text,text,uuid) to authenticated, service_role;
grant execute on function public.apply_player_manual_override(text,integer,text,text,jsonb,text) to authenticated;
grant execute on function public.release_player_manual_override(uuid,text) to authenticated;

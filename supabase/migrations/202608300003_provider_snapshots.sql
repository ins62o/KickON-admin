-- KickOn Data Center: sanitized provider snapshots, fixture/standing diffs,
-- and field-level override protection. Apply after 202608300002.

create table public.provider_entity_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 2 and 80),
  entity_type text not null check (entity_type in ('team', 'player', 'fixture', 'standing', 'ranking', 'transfer')),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  provider_entity_id text,
  season integer,
  league_id text,
  source_endpoint text,
  raw_payload jsonb not null,
  comparable_value jsonb not null,
  snapshot_hash text not null check (char_length(snapshot_hash) = 64),
  fetched_at timestamptz not null,
  request_id text,
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(raw_payload) in ('object', 'array')),
  check (jsonb_typeof(comparable_value) = 'object')
);

create unique index provider_entity_snapshots_dedupe_idx
  on public.provider_entity_snapshots (provider, entity_type, entity_id, snapshot_hash);
create index provider_entity_snapshots_latest_idx
  on public.provider_entity_snapshots (entity_type, entity_id, fetched_at desc);

comment on table public.provider_entity_snapshots is
  '신뢰된 동기화 백엔드가 서버 전용 Endpoint로 적재한 정제된 외부 원본과 비교용 필드. 비밀값과 사용자 데이터는 저장하지 않는다.';

create or replace function public.ingest_provider_entity_snapshot(
  p_provider text,
  p_entity_type text,
  p_entity_id text,
  p_provider_entity_id text,
  p_season integer,
  p_league_id text,
  p_source_endpoint text,
  p_raw_payload jsonb,
  p_comparable_value jsonb,
  p_snapshot_hash text,
  p_fetched_at timestamptz,
  p_request_id text,
  p_sync_run_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_snapshot uuid;
  safe_fetched_at timestamptz := greatest(now() - interval '90 days', least(coalesce(p_fetched_at, now()), now() + interval '5 minutes'));
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_provider, ''))) < 2
    or p_entity_type not in ('team', 'player', 'fixture', 'standing', 'ranking', 'transfer')
    or char_length(coalesce(p_entity_id, '')) < 1
    or char_length(coalesce(p_snapshot_hash, '')) <> 64
    or p_snapshot_hash !~ '^[0-9a-fA-F]{64}$'
    or p_raw_payload is null
    or p_comparable_value is null
    or jsonb_typeof(p_raw_payload) not in ('object', 'array')
    or jsonb_typeof(p_comparable_value) <> 'object'
    or p_comparable_value = '{}'::jsonb then
    raise exception 'INVALID_PROVIDER_SNAPSHOT';
  end if;

  insert into public.provider_entity_snapshots (
    provider, entity_type, entity_id, provider_entity_id, season, league_id,
    source_endpoint, raw_payload, comparable_value, snapshot_hash, fetched_at,
    request_id, sync_run_id
  ) values (
    left(trim(p_provider), 80), p_entity_type, left(trim(p_entity_id), 160),
    nullif(left(trim(p_provider_entity_id), 160), ''), p_season,
    nullif(left(trim(p_league_id), 80), ''), nullif(left(trim(p_source_endpoint), 500), ''),
    p_raw_payload, p_comparable_value, lower(p_snapshot_hash), safe_fetched_at,
    nullif(left(trim(p_request_id), 200), ''), p_sync_run_id
  )
  on conflict (provider, entity_type, entity_id, snapshot_hash) do update set
    fetched_at = greatest(public.provider_entity_snapshots.fetched_at, excluded.fetched_at),
    source_endpoint = coalesce(excluded.source_endpoint, public.provider_entity_snapshots.source_endpoint),
    request_id = coalesce(excluded.request_id, public.provider_entity_snapshots.request_id),
    sync_run_id = coalesce(excluded.sync_run_id, public.provider_entity_snapshots.sync_run_id)
  returning id into target_snapshot;

  return target_snapshot;
end;
$$;

create or replace function public.protect_fixture_manual_overrides()
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
    where override.entity_type = 'fixture'
      and override.entity_id = new.id
      and override.league_id = new.league_id
      and override.released_at is null
  loop
    case active_override.field_path
      when 'kickoff_at' then new.kickoff_at := (active_override.override_value #>> '{}')::timestamptz;
      when 'status' then new.status := active_override.override_value #>> '{}';
      when 'home_score' then new.home_score := (active_override.override_value #>> '{}')::integer;
      when 'away_score' then new.away_score := (active_override.override_value #>> '{}')::integer;
      when 'round' then new.round := (active_override.override_value #>> '{}')::integer;
      else null;
    end case;
  end loop;
  return new;
end;
$$;

create trigger fixtures_protect_manual_overrides
  before insert or update on public.fixtures
  for each row execute function public.protect_fixture_manual_overrides();

create or replace function public.protect_standing_manual_overrides()
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
    where override.entity_type = 'standing'
      and override.entity_id = new.team_id
      and override.season = new.season
      and override.league_id = new.league_id
      and override.released_at is null
  loop
    case active_override.field_path
      when 'rank' then new.rank := (active_override.override_value #>> '{}')::integer;
      when 'played' then new.played := (active_override.override_value #>> '{}')::integer;
      when 'won' then new.won := (active_override.override_value #>> '{}')::integer;
      when 'drawn' then new.drawn := (active_override.override_value #>> '{}')::integer;
      when 'lost' then new.lost := (active_override.override_value #>> '{}')::integer;
      when 'goals_for' then new.goals_for := (active_override.override_value #>> '{}')::integer;
      when 'goals_against' then new.goals_against := (active_override.override_value #>> '{}')::integer;
      when 'goal_difference' then new.goal_difference := (active_override.override_value #>> '{}')::integer;
      when 'points' then new.points := (active_override.override_value #>> '{}')::integer;
      when 'clean_sheets' then new.clean_sheets := (active_override.override_value #>> '{}')::integer;
      when 'average_possession' then new.average_possession := (active_override.override_value #>> '{}')::numeric;
      else null;
    end case;
  end loop;
  return new;
end;
$$;

create trigger league_standings_protect_manual_overrides
  before insert or update on public.league_standings
  for each row execute function public.protect_standing_manual_overrides();

create or replace function public.apply_fixture_manual_override(
  p_fixture_id text,
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
  current_league text;
  target_override uuid;
begin
  if not public.is_admin('admin') or current_actor is null then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_field_path not in ('kickoff_at', 'status', 'home_score', 'away_score', 'round')
    or p_override_value is null
    or char_length(trim(coalesce(p_reason, ''))) < 3
    or char_length(p_reason) > 1000 then
    raise exception 'INVALID_FIXTURE_OVERRIDE';
  end if;
  if p_field_path = 'status' and (p_override_value #>> '{}') not in ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED') then
    raise exception 'INVALID_FIXTURE_STATUS';
  end if;

  select to_jsonb(fixture), fixture.league_id into current_row, current_league
  from public.fixtures fixture
  where fixture.id = p_fixture_id
  for update;
  if current_row is null then raise exception 'FIXTURE_NOT_FOUND'; end if;

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  ) values (
    'fixture', p_fixture_id, 2026, current_league, p_field_path,
    current_row -> p_field_path, p_override_value, trim(p_reason), true, current_actor
  )
  on conflict (entity_type, entity_id, season, league_id, field_path) where released_at is null
  do update set override_value = excluded.override_value, reason = excluded.reason,
    blocks_sync = true, updated_at = now()
  returning id into target_override;

  update public.fixtures fixture set
    kickoff_at = case when p_field_path = 'kickoff_at' then (p_override_value #>> '{}')::timestamptz else fixture.kickoff_at end,
    status = case when p_field_path = 'status' then p_override_value #>> '{}' else fixture.status end,
    home_score = case when p_field_path = 'home_score' then (p_override_value #>> '{}')::integer else fixture.home_score end,
    away_score = case when p_field_path = 'away_score' then (p_override_value #>> '{}')::integer else fixture.away_score end,
    round = case when p_field_path = 'round' then (p_override_value #>> '{}')::integer else fixture.round end,
    updated_at = now()
  where fixture.id = p_fixture_id;

  return target_override;
end;
$$;

create or replace function public.apply_standing_manual_override(
  p_team_id text,
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
  numeric_value numeric;
begin
  if not public.is_admin('admin') or current_actor is null then raise exception 'ADMIN_REQUIRED'; end if;
  if p_field_path not in ('rank', 'played', 'won', 'drawn', 'lost', 'goals_for', 'goals_against', 'goal_difference', 'points', 'clean_sheets', 'average_possession')
    or p_override_value is null
    or char_length(trim(coalesce(p_reason, ''))) < 3
    or char_length(p_reason) > 1000 then
    raise exception 'INVALID_STANDING_OVERRIDE';
  end if;
  numeric_value := (p_override_value #>> '{}')::numeric;
  if (p_field_path <> 'goal_difference' and numeric_value < 0)
    or (p_field_path = 'average_possession' and numeric_value > 100)
    or (p_field_path <> 'average_possession' and numeric_value <> trunc(numeric_value)) then
    raise exception 'INVALID_STANDING_VALUE';
  end if;

  select to_jsonb(standing) into current_row
  from public.league_standings standing
  where standing.team_id = p_team_id and standing.season = p_season and standing.league_id = p_league_id
  for update;
  if current_row is null then raise exception 'STANDING_NOT_FOUND'; end if;

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  ) values (
    'standing', p_team_id, p_season, p_league_id, p_field_path,
    current_row -> p_field_path, p_override_value, trim(p_reason), true, current_actor
  )
  on conflict (entity_type, entity_id, season, league_id, field_path) where released_at is null
  do update set override_value = excluded.override_value, reason = excluded.reason,
    blocks_sync = true, updated_at = now()
  returning id into target_override;

  update public.league_standings standing set
    rank = case when p_field_path = 'rank' then numeric_value::integer else standing.rank end,
    played = case when p_field_path = 'played' then numeric_value::integer else standing.played end,
    won = case when p_field_path = 'won' then numeric_value::integer else standing.won end,
    drawn = case when p_field_path = 'drawn' then numeric_value::integer else standing.drawn end,
    lost = case when p_field_path = 'lost' then numeric_value::integer else standing.lost end,
    goals_for = case when p_field_path = 'goals_for' then numeric_value::integer else standing.goals_for end,
    goals_against = case when p_field_path = 'goals_against' then numeric_value::integer else standing.goals_against end,
    goal_difference = case when p_field_path = 'goal_difference' then numeric_value::integer else standing.goal_difference end,
    points = case when p_field_path = 'points' then numeric_value::integer else standing.points end,
    clean_sheets = case when p_field_path = 'clean_sheets' then numeric_value::integer else standing.clean_sheets end,
    average_possession = case when p_field_path = 'average_possession' then numeric_value else standing.average_possession end,
    updated_at = now()
  where standing.team_id = p_team_id and standing.season = p_season and standing.league_id = p_league_id;

  return target_override;
end;
$$;

create or replace function public.release_entity_manual_override(
  p_override_id uuid,
  p_entity_type text,
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
  if not public.is_admin('admin') or current_actor is null then raise exception 'ADMIN_REQUIRED'; end if;
  if p_entity_type not in ('fixture', 'standing')
    or char_length(trim(coalesce(p_release_reason, ''))) < 3
    or char_length(p_release_reason) > 1000 then
    raise exception 'INVALID_RELEASE_REQUEST';
  end if;

  update public.manual_overrides override set
    released_by = current_actor, released_at = now(), release_reason = trim(p_release_reason),
    blocks_sync = false, updated_at = now()
  where override.id = p_override_id and override.entity_type = p_entity_type and override.released_at is null;
  return found;
end;
$$;

alter table public.provider_entity_snapshots enable row level security;
create policy "admins read provider snapshots" on public.provider_entity_snapshots
  for select to authenticated using (public.is_admin('viewer'));

revoke all on table public.provider_entity_snapshots from public, anon;
grant select on table public.provider_entity_snapshots to authenticated;
grant all on table public.provider_entity_snapshots to service_role;

revoke all on function public.ingest_provider_entity_snapshot(text,text,text,text,integer,text,text,jsonb,jsonb,text,timestamptz,text,uuid) from public, anon, authenticated;
revoke all on function public.protect_fixture_manual_overrides() from public, anon, authenticated;
revoke all on function public.protect_standing_manual_overrides() from public, anon, authenticated;
revoke all on function public.apply_fixture_manual_override(text,text,jsonb,text) from public, anon;
revoke all on function public.apply_standing_manual_override(text,integer,text,text,jsonb,text) from public, anon;
revoke all on function public.release_entity_manual_override(uuid,text,text) from public, anon;
grant execute on function public.ingest_provider_entity_snapshot(text,text,text,text,integer,text,text,jsonb,jsonb,text,timestamptz,text,uuid) to service_role;
grant execute on function public.apply_fixture_manual_override(text,text,jsonb,text) to authenticated;
grant execute on function public.apply_standing_manual_override(text,integer,text,text,jsonb,text) to authenticated;
grant execute on function public.release_entity_manual_override(uuid,text,text) to authenticated;

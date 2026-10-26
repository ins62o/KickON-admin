-- Multi-league admin contracts. No existing migration history is rewritten.
-- Review against the deployed function definitions before applying.
begin;

-- Server-side league mapping, shared by all scheduler entry points.
create or replace function public.admin_football_leagues()
returns table(league_id text, provider_league_id bigint)
language sql immutable set search_path = '' as $$
  values ('kleague'::text, 1034::bigint), ('kleague2'::text, 1362::bigint);
$$;
revoke all on function public.admin_football_leagues() from public, anon, authenticated;

create or replace function public.admin_assert_football_scope(p_season integer, p_league_id text, p_team_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_season is null or p_season not between 2000 and 2200
    or p_league_id is null or not exists (select 1 from public.admin_football_leagues() where league_id = p_league_id) then
    raise exception 'SEASON_AND_LEAGUE_REQUIRED';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.league_standings where season = p_season
      and league_id = p_league_id and team_id = p_team_id
  ) then raise exception 'TEAM_LEAGUE_MISMATCH'; end if;
end;
$$;
revoke all on function public.admin_assert_football_scope(integer, text, text) from public, anon, authenticated;

-- Teams and fixture IDs are global identities. Their existing PK/FKs stay intact.
create index if not exists team_players_admin_scope_idx on public.team_players (season, league_id, team_id, player_id) where in_squad;
create index if not exists fixtures_admin_scope_idx on public.fixtures (league_id, kickoff_at, id);
create index if not exists league_standings_admin_rank_idx on public.league_standings (season, league_id, rank, team_id);
create index if not exists player_scoring_stats_admin_team_idx on public.player_scoring_stats (season, league_id, team_id, player_id);

alter table public.manual_overrides alter column season drop default, alter column league_id drop default;

-- Unknown legacy/global events remain NULL; do not relabel them as K1.
alter table public.player_change_events add column if not exists season integer, add column if not exists league_id text;
alter table public.football_sync_state add column if not exists season integer, add column if not exists league_id text;
create index if not exists player_change_events_scope_idx on public.player_change_events (season, league_id, player_id, detected_at desc);
create index if not exists football_sync_state_scope_idx on public.football_sync_state (season, league_id, last_attempted_at desc);

-- Keep the globally unique sync_key API, and reject cross-scope upserts.
-- Writers should use <operation>:<season>:<league_id>; legacy NULL scope stays global.
create or replace function public.guard_football_sync_state_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare existing public.football_sync_state%rowtype;
begin
  if (new.season is null) <> (new.league_id is null) then raise exception 'INCOMPLETE_SYNC_SCOPE'; end if;
  if new.league_id is not null then perform public.admin_assert_football_scope(new.season, new.league_id); end if;
  if tg_op = 'UPDATE' then existing := old;
  else select * into existing from public.football_sync_state where sync_key = new.sync_key; end if;
  if existing.sync_key is not null and (existing.season is distinct from new.season or existing.league_id is distinct from new.league_id) then
    raise exception 'SYNC_SCOPE_COLLISION: use a separate sync_key for each season and league';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_football_sync_state_scope() from public, anon, authenticated;
create trigger football_sync_state_scope before insert or update on public.football_sync_state
for each row execute function public.guard_football_sync_state_scope();

create or replace function public.set_player_change_event_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_snapshot_id is not null then
    select s.season, s.league_id into new.season, new.league_id
    from public.player_squad_snapshots s where s.id = new.current_snapshot_id;
  end if;
  if (new.season is null) <> (new.league_id is null) then raise exception 'INCOMPLETE_CHANGE_SCOPE'; end if;
  return new;
end;
$$;
revoke all on function public.set_player_change_event_scope() from public, anon, authenticated;
create trigger player_change_event_scope before insert or update on public.player_change_events
for each row execute function public.set_player_change_event_scope();
update public.player_change_events e set season = s.season, league_id = s.league_id
from public.player_squad_snapshots s where e.current_snapshot_id = s.id;

-- The payload hash is not an identity across leagues or seasons.
create unique index provider_entity_snapshots_scoped_dedupe_idx
on public.provider_entity_snapshots (provider, entity_type, entity_id, (coalesce(season, 0)), (coalesce(league_id, '')), snapshot_hash);
drop index public.provider_entity_snapshots_dedupe_idx;
create index if not exists provider_entity_snapshots_scope_latest_idx
on public.provider_entity_snapshots (season, league_id, entity_type, entity_id, fetched_at desc, id);

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

  if p_entity_type <> 'team' then
    perform public.admin_assert_football_scope(p_season, p_league_id);
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
  on conflict (provider, entity_type, entity_id, (coalesce(season, 0)), (coalesce(league_id, '')), snapshot_hash) do update set
    fetched_at = greatest(public.provider_entity_snapshots.fetched_at, excluded.fetched_at),
    source_endpoint = coalesce(excluded.source_endpoint, public.provider_entity_snapshots.source_endpoint),
    request_id = coalesce(excluded.request_id, public.provider_entity_snapshots.request_id),
    sync_run_id = coalesce(excluded.sync_run_id, public.provider_entity_snapshots.sync_run_id)
  returning id into target_snapshot;

  return target_snapshot;
end;
$$;

create or replace function public.capture_player_squad_snapshot(
  p_team_id text,
  p_season integer default null,
  p_league_id text default null,
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
  perform public.admin_assert_football_scope(p_season, p_league_id, p_team_id);
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

create or replace function public.admin_create_manual_player(
  p_team_id text,
  p_player_name text,
  p_reason text,
  p_display_name_ko text default null,
  p_shirt_number integer default null,
  p_position text default null,
  p_detailed_position text default null,
  p_season integer default null,
  p_league_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_team_id text := trim(coalesce(p_team_id, ''));
  normalized_player_name text := trim(coalesce(p_player_name, ''));
  normalized_name_ko text := nullif(trim(coalesce(p_display_name_ko, '')), '');
  normalized_reason text := trim(coalesce(p_reason, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  new_player_id text := 'manual_' || gen_random_uuid()::text;
begin
  perform public.admin_assert_football_scope(p_season, p_league_id, p_team_id);
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if char_length(normalized_team_id) not between 1 and 120
    or char_length(normalized_player_name) not between 1 and 120
    or (normalized_name_ko is not null and char_length(normalized_name_ko) > 120)
    or char_length(normalized_reason) not between 3 and 1000
    or char_length(normalized_league_id) not between 1 and 120
    or p_season is null or p_season not between 2000 and 2200
    or p_shirt_number is not null and p_shirt_number not between 0 and 999
    or char_length(trim(coalesce(p_position, ''))) > 120
    or char_length(trim(coalesce(p_detailed_position, ''))) > 120
  then
    raise exception 'INVALID_MANUAL_PLAYER';
  end if;
  if not exists (
    select 1 from public.teams team where team.id = normalized_team_id
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  insert into public.team_players (
    season, league_id, team_id, player_id, player_name, display_name,
    display_name_ko, shirt_number, position, detailed_position, in_squad,
    data_source, manual_lock, updated_at
  ) values (
    p_season, normalized_league_id, normalized_team_id, new_player_id,
    normalized_player_name, normalized_player_name, normalized_name_ko,
    p_shirt_number, nullif(trim(coalesce(p_position, '')), ''),
    nullif(trim(coalesce(p_detailed_position, '')), ''), true, 'MANUAL', true,
    now()
  );

  insert into public.football_player_localizations (
    provider, provider_player_id, name_en, name_ko, is_verified, updated_at
  ) values (
    'manual', new_player_id, normalized_player_name, normalized_name_ko,
    normalized_name_ko is not null, now()
  )
  on conflict (provider, provider_player_id) do update set
    name_en = excluded.name_en,
    name_ko = excluded.name_ko,
    is_verified = excluded.is_verified,
    updated_at = now();

  insert into public.manual_player_records (
    season, league_id, player_id, team_id, created_by, creation_reason
  ) values (
    p_season, normalized_league_id, new_player_id, normalized_team_id,
    current_actor, normalized_reason
  );

  if normalized_name_ko is not null then
    insert into public.football_player_localization_reviews (
      provider, provider_player_id, before_name_ko, after_name_ko, reason,
      changed_by
    ) values (
      'manual', new_player_id, null, normalized_name_ko, normalized_reason,
      current_actor
    );
  end if;

  perform public.data_center_write_audit(
    'MANUAL_PLAYER_CREATED',
    'team_player',
    new_player_id,
    null,
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'teamId', normalized_team_id,
      'playerName', normalized_player_name,
      'displayNameKo', normalized_name_ko,
      'shirtNumber', p_shirt_number,
      'position', nullif(trim(coalesce(p_position, '')), ''),
      'detailedPosition', nullif(trim(coalesce(p_detailed_position, '')), ''),
      'inSquad', true,
      'dataSource', 'MANUAL',
      'manualLock', true
    ),
    normalized_reason
  );
  return new_player_id;
end;
$$;

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
  perform public.admin_assert_football_scope(p_season, p_league_id, null);
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

  if p_field_path = 'team_id' then
    perform public.admin_assert_football_scope(p_season, p_league_id, p_override_value #>> '{}');
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
  perform public.admin_assert_football_scope(p_season, p_league_id, null);
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

  if p_patch ? 'team_id' then
    perform public.admin_assert_football_scope(p_season, p_league_id, p_patch ->> 'team_id');
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
  perform public.admin_assert_football_scope(p_season, p_league_id, p_team_id);
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

create or replace function public.admin_merge_manual_player(
  p_manual_player_id text,
  p_provider_player_id text,
  p_season integer,
  p_league_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_manual_id text := trim(coalesce(p_manual_player_id, ''));
  normalized_provider_id text := trim(coalesce(p_provider_player_id, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  manual_row public.team_players;
  provider_row public.team_players;
  manual_name_ko text;
  manual_verified boolean := false;
  provider_name_ko text;
  provider_verified boolean := false;
begin
  perform public.admin_assert_football_scope(p_season, p_league_id, null);
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if normalized_manual_id !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or char_length(normalized_provider_id) not between 1 and 120
    or normalized_manual_id = normalized_provider_id
    or char_length(normalized_league_id) not between 1 and 120
    or p_season is null or p_season not between 2000 and 2200
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_PLAYER_MERGE';
  end if;

  select player.* into manual_row
  from public.team_players player
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_manual_id
    and player.data_source = 'MANUAL'
  for update;
  if not found then
    raise exception 'MANUAL_PLAYER_NOT_FOUND';
  end if;

  select player.* into provider_row
  from public.team_players player
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_provider_id
    and player.data_source = 'SPORTSMONKS'
  for update;
  if not found then
    raise exception 'PROVIDER_PLAYER_NOT_FOUND';
  end if;

  select localization.name_ko, localization.is_verified
  into manual_name_ko, manual_verified
  from public.football_player_localizations localization
  where localization.provider = 'manual'
    and localization.provider_player_id = normalized_manual_id;

  select localization.name_ko, localization.is_verified
  into provider_name_ko, provider_verified
  from public.football_player_localizations localization
  where localization.provider = 'sportmonks'
    and localization.provider_player_id = normalized_provider_id
  for update;

  if manual_name_ko is not null
    and provider_verified
    and provider_name_ko is distinct from manual_name_ko
  then
    raise exception 'VERIFIED_PLAYER_NAME_CONFLICT';
  end if;

  if manual_name_ko is not null then
    insert into public.football_player_localizations (
      provider, provider_player_id, name_en, name_ko, is_verified, updated_at
    ) values (
      'sportmonks', normalized_provider_id,
      coalesce(nullif(trim(provider_row.display_name), ''), provider_row.player_name),
      manual_name_ko,
      true,
      now()
    )
    on conflict (provider, provider_player_id) do update set
      name_en = excluded.name_en,
      name_ko = case
        when public.football_player_localizations.is_verified
          then public.football_player_localizations.name_ko
        else excluded.name_ko
      end,
      is_verified = true,
      updated_at = now();

    if provider_name_ko is null or not coalesce(provider_verified, false) then
      insert into public.football_player_localization_reviews (
        provider, provider_player_id, before_name_ko, after_name_ko, reason,
        changed_by
      ) values (
        'sportmonks', normalized_provider_id, provider_name_ko, manual_name_ko,
        normalized_reason, current_actor
      );
    end if;
  end if;

  update public.team_players player set
    in_squad = false,
    manual_lock = false,
    updated_at = now()
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_manual_id;

  update public.manual_player_records record set
    merged_into_player_id = normalized_provider_id,
    merged_by = current_actor,
    merged_reason = normalized_reason,
    merged_at = now(),
    updated_by = current_actor,
    update_reason = normalized_reason,
    updated_at = now()
  where record.season = p_season
    and record.league_id = normalized_league_id
    and record.player_id = normalized_manual_id
    and record.merged_at is null;
  if not found then
    raise exception 'MANUAL_PLAYER_RECORD_NOT_FOUND';
  end if;

  perform public.data_center_write_audit(
    'MANUAL_PLAYER_MERGED',
    'team_player',
    normalized_manual_id,
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'teamId', manual_row.team_id,
      'inSquad', manual_row.in_squad,
      'manualLock', manual_row.manual_lock
    ),
    jsonb_build_object(
      'mergedIntoPlayerId', normalized_provider_id,
      'providerTeamId', provider_row.team_id,
      'inSquad', false,
      'manualLock', false
    ),
    normalized_reason
  );
  return true;
end;
$$;

create or replace function public.ingest_provider_player_change_candidates(
  p_provider text,
  p_source_reference text,
  p_sync_run_id uuid,
  p_candidates jsonb
)
returns table (
  accepted_count integer,
  created_count integer,
  existing_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate jsonb;
  candidate_season integer;
  candidate_league_id text;
  normalized_provider text := lower(trim(coalesce(p_provider, '')));
  candidate_dedupe text;
  candidate_player_id text;
  candidate_player_name text;
  candidate_from_team_id text;
  candidate_to_team_id text;
  candidate_from_team_name text;
  candidate_to_team_name text;
  candidate_change_type text;
  candidate_movement_date date;
  candidate_observed_at timestamptz;
  candidate_before_value jsonb;
  candidate_after_value jsonb;
  existing_event_id uuid;
  reflected_now boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if normalized_provider <> 'sportmonks' then
    raise exception 'UNSUPPORTED_CHANGE_PROVIDER';
  end if;
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) < 1
    or jsonb_array_length(p_candidates) > 100 then
    raise exception 'INVALID_CHANGE_CANDIDATE_BATCH';
  end if;
  if char_length(coalesce(p_source_reference, '')) > 500 then
    raise exception 'INVALID_CHANGE_SOURCE';
  end if;
  if p_sync_run_id is not null and not exists (
    select 1 from public.sync_runs run where run.id = p_sync_run_id
  ) then
    raise exception 'SYNC_RUN_NOT_FOUND';
  end if;

  accepted_count := jsonb_array_length(p_candidates);
  created_count := 0;
  existing_count := 0;

  -- Stable ordering prevents advisory-lock inversion across concurrent batches.
  for candidate in
    select item.value
    from jsonb_array_elements(p_candidates) item(value)
    order by item.value ->> 'dedupeKey'
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'INVALID_CHANGE_CANDIDATE';
    end if;

    candidate_dedupe := lower(trim(coalesce(candidate ->> 'dedupeKey', '')));
    candidate_season := (candidate ->> 'season')::integer;
    candidate_league_id := candidate ->> 'leagueId';
    perform public.admin_assert_football_scope(candidate_season, candidate_league_id);
    candidate_player_id := trim(coalesce(candidate ->> 'playerId', ''));
    candidate_player_name := trim(coalesce(candidate ->> 'playerName', ''));
    candidate_from_team_id := nullif(trim(coalesce(candidate ->> 'fromTeamId', '')), '');
    candidate_to_team_id := nullif(trim(coalesce(candidate ->> 'toTeamId', '')), '');
    candidate_from_team_name := nullif(trim(coalesce(candidate ->> 'fromTeamName', '')), '');
    candidate_to_team_name := nullif(trim(coalesce(candidate ->> 'toTeamName', '')), '');
    candidate_change_type := trim(coalesce(candidate ->> 'changeType', ''));
    candidate_movement_date := case
      when coalesce(candidate ->> 'movementDate', '') = '' then null
      else (candidate ->> 'movementDate')::date
    end;
    candidate_observed_at := (candidate ->> 'observedAt')::timestamptz;
    candidate_before_value := coalesce(candidate -> 'beforeValue', 'null'::jsonb);
    candidate_after_value := coalesce(candidate -> 'afterValue', 'null'::jsonb);

    if candidate_dedupe !~ '^[a-f0-9]{64}$'
      or candidate_player_id !~ '^[A-Za-z0-9._:-]{1,160}$'
      or char_length(candidate_player_name) < 1
      or char_length(candidate_player_name) > 200
      or candidate_change_type not in (
        'squad_added', 'transfer', 'loan_in', 'loan_out', 'loan_return',
        'released', 'contract_expired', 'squad_removed', 'unknown'
      )
      or (candidate_from_team_id is null and candidate_to_team_id is null
        and candidate_from_team_name is null and candidate_to_team_name is null)
      or char_length(coalesce(candidate_from_team_id, '')) > 80
      or char_length(coalesce(candidate_to_team_id, '')) > 80
      or char_length(coalesce(candidate_from_team_name, '')) > 200
      or char_length(coalesce(candidate_to_team_name, '')) > 200
      or octet_length(candidate_before_value::text) > 20000
      or octet_length(candidate_after_value::text) > 20000
      or candidate_observed_at is null
      or candidate_observed_at < now() - interval '1 year'
      or candidate_observed_at > now() + interval '1 day' then
      raise exception 'INVALID_CHANGE_CANDIDATE';
    end if;

    if candidate_change_type in ('squad_added', 'loan_in')
      and candidate_to_team_id is null and candidate_to_team_name is null then
      raise exception 'CHANGE_DESTINATION_REQUIRED';
    end if;
    if candidate_change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
      and candidate_from_team_id is null and candidate_from_team_name is null then
      raise exception 'CHANGE_ORIGIN_REQUIRED';
    end if;
    if candidate_from_team_id is not null and not exists (
      select 1 from public.teams team where team.id = candidate_from_team_id
    ) then
      raise exception 'CHANGE_ORIGIN_TEAM_NOT_FOUND';
    end if;
    if candidate_to_team_id is not null and not exists (
      select 1 from public.teams team where team.id = candidate_to_team_id
    ) then
      raise exception 'CHANGE_DESTINATION_TEAM_NOT_FOUND';
    end if;

    reflected_now := false;
    if candidate_change_type in ('squad_added', 'transfer', 'loan_in', 'loan_return')
      and candidate_to_team_id is not null then
      select exists (
        select 1
        from public.team_players player
        where player.player_id = candidate_player_id
          and player.team_id = candidate_to_team_id
          and player.season = candidate_season
          and player.league_id = candidate_league_id
          and player.in_squad
      ) into reflected_now;
    elsif candidate_change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
      and candidate_from_team_id is not null then
      select not exists (
        select 1
        from public.team_players player
        where player.player_id = candidate_player_id
          and player.team_id = candidate_from_team_id
          and player.season = candidate_season
          and player.league_id = candidate_league_id
          and player.in_squad
      ) into reflected_now;
    end if;

    candidate_dedupe := md5(concat_ws('|', candidate_season, candidate_league_id, candidate_dedupe))
      || md5(concat_ws('|', candidate_dedupe, candidate_league_id, candidate_season));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate_dedupe, 0)
    );
    select event.id into existing_event_id
    from public.player_change_events event
    where event.dedupe_key = candidate_dedupe;

    insert into public.player_change_events as existing (
      dedupe_key, player_id, player_name, from_team_id, to_team_id,
      change_type, field_path, before_value, after_value, movement_date,
      detected_at, source, source_reference, db_reflected, review_status,
      reflected_at, sync_run_id, season, league_id
    ) values (
      candidate_dedupe, candidate_player_id, candidate_player_name,
      candidate_from_team_id, candidate_to_team_id, candidate_change_type,
      'team_id', candidate_before_value, candidate_after_value,
      candidate_movement_date, candidate_observed_at, 'SportsMonks candidate',
      nullif(left(trim(coalesce(p_source_reference, '')), 500), ''),
      reflected_now, 'detected', case when reflected_now then now() else null end,
      p_sync_run_id, candidate_season, candidate_league_id
    )
    on conflict (dedupe_key) do update set
      player_name = excluded.player_name,
      from_team_id = coalesce(excluded.from_team_id, existing.from_team_id),
      to_team_id = coalesce(excluded.to_team_id, existing.to_team_id),
      change_type = case
        when existing.review_status = 'detected'
          and existing.change_type = 'unknown'
        then excluded.change_type
        else existing.change_type
      end,
      before_value = excluded.before_value,
      after_value = excluded.after_value,
      movement_date = coalesce(excluded.movement_date, existing.movement_date),
      detected_at = greatest(existing.detected_at, excluded.detected_at),
      source_reference = coalesce(excluded.source_reference, existing.source_reference),
      db_reflected = existing.db_reflected or excluded.db_reflected,
      reflected_at = case
        when existing.db_reflected or excluded.db_reflected
        then coalesce(existing.reflected_at, excluded.reflected_at, now())
        else null
      end,
      sync_run_id = coalesce(excluded.sync_run_id, existing.sync_run_id);

    if existing_event_id is null then
      created_count := created_count + 1;
    else
      existing_count := existing_count + 1;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function public.reconcile_provider_player_change_candidates(
  p_team_id text,
  p_season integer default null,
  p_league_id text default null,
  p_sync_run_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer := 0;
begin
  perform public.admin_assert_football_scope(p_season, p_league_id, p_team_id);
  if not public.is_admin('operator')
    and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  if p_team_id is null or p_team_id = ''
    or p_season < 2000 or p_season > 2200
    or not exists (select 1 from public.teams team where team.id = p_team_id) then
    raise exception 'INVALID_RECONCILIATION_TARGET';
  end if;

  update public.player_change_events event set
    db_reflected = true,
    reflected_at = coalesce(event.reflected_at, now()),
    sync_run_id = coalesce(p_sync_run_id, event.sync_run_id)
  where event.season = p_season and event.league_id = p_league_id
    and not event.db_reflected
    and event.source = 'SportsMonks candidate'
    and (
      (
        event.to_team_id = p_team_id
        and event.change_type in ('squad_added', 'transfer', 'loan_in', 'loan_return')
        and exists (
          select 1 from public.team_players player
          where player.player_id = event.player_id
            and player.team_id = p_team_id
            and player.season = p_season
            and player.league_id = p_league_id
            and player.in_squad
        )
      )
      or (
        event.from_team_id = p_team_id
        and event.change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
        and not exists (
          select 1 from public.team_players player
          where player.player_id = event.player_id
            and player.team_id = p_team_id
            and player.season = p_season
            and player.league_id = p_league_id
            and player.in_squad
        )
      )
    );

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;


create or replace function public.admin_set_verified_player_name(
  p_provider_player_id text, p_name_ko text, p_reason text, p_season integer, p_league_id text
) returns public.football_player_localizations
language plpgsql security definer set search_path = '' as $$
declare result_row public.football_player_localizations;
begin
  if (select auth.uid()) is null or not public.admin_has_capability('football.write') then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  perform public.admin_assert_football_scope(p_season, p_league_id);
  perform 1 from public.team_players where season = p_season and league_id = p_league_id
    and player_id = p_provider_player_id for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  result_row := public.admin_set_verified_player_name(p_provider_player_id, p_name_ko, p_reason);
  perform public.data_center_write_audit('PLAYER_VERIFIED_NAME_SCOPE', 'player', p_provider_player_id,
    null, jsonb_build_object('season', p_season, 'leagueId', p_league_id,
      'nameKo', p_name_ko, 'scope', 'canonical-provider-identity'), p_reason);
  return result_row;
end;
$$;
revoke all on function public.admin_set_verified_player_name(text, text, text, integer, text) from public, anon;
grant execute on function public.admin_set_verified_player_name(text, text, text, integer, text) to authenticated;

-- The fixture PK is globally unique. Scoped overloads reject stale/mismatched
-- URLs while existing callers still derive league from the locked fixture row.
create or replace function public.apply_fixture_manual_override(
  p_fixture_id text, p_field_path text, p_override_value jsonb, p_reason text, p_league_id text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin('admin') then raise exception 'ADMIN_REQUIRED'; end if;
  if p_league_id is null or p_league_id not in ('kleague', 'kleague2') then raise exception 'SEASON_AND_LEAGUE_REQUIRED'; end if;
  perform 1 from public.fixtures where id = p_fixture_id and league_id = p_league_id for update;
  if not found then raise exception 'FIXTURE_LEAGUE_MISMATCH'; end if;
  return public.apply_fixture_manual_override(p_fixture_id, p_field_path, p_override_value, p_reason);
end;
$$;
revoke all on function public.apply_fixture_manual_override(text, text, jsonb, text, text) from public, anon;
grant execute on function public.apply_fixture_manual_override(text, text, jsonb, text, text) to authenticated;

create or replace function public.admin_update_fixture_schedule(
  p_fixture_id text, p_kickoff_at timestamptz, p_stadium_id text,
  p_latitude double precision, p_longitude double precision, p_radius_meters integer,
  p_reason text, p_league_id text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not public.admin_has_capability('data.write') then raise exception 'FIXTURE_EDITOR_REQUIRED'; end if;
  if p_league_id is null or p_league_id not in ('kleague', 'kleague2') then raise exception 'SEASON_AND_LEAGUE_REQUIRED'; end if;
  perform 1 from public.fixtures where id = p_fixture_id and league_id = p_league_id for update;
  if not found then raise exception 'FIXTURE_LEAGUE_MISMATCH'; end if;
  return public.admin_update_fixture_schedule(p_fixture_id, p_kickoff_at, p_stadium_id, p_latitude, p_longitude, p_radius_meters, p_reason);
end;
$$;
revoke all on function public.admin_update_fixture_schedule(text, timestamptz, text, double precision, double precision, integer, text, text) from public, anon;
grant execute on function public.admin_update_fixture_schedule(text, timestamptz, text, double precision, double precision, integer, text, text) to authenticated;

-- Daily cron schedule is preserved; only target selection and payloads change.
create or replace function public.invoke_scheduled_team_squad_sync()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_function_url text;
  function_url text;
  sync_secret text;
  target_team record;
  request_count integer := 0;
begin
  select decrypted_secret into live_function_url
  from vault.decrypted_secrets
  where name = 'kickon_live_football_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'kickon_football_sync_secret'
  limit 1;

  if live_function_url is null or sync_secret is null then
    raise warning 'KickON squad sync Vault secrets are missing';
    return 0;
  end if;

  function_url := regexp_replace(
    live_function_url,
    '/sync-live-football$',
    '/sync-team-squad'
  );

  for target_team in
    select distinct team.id, standing.season, standing.league_id
    from public.teams team
    join public.league_standings standing
      on standing.team_id = team.id
      and standing.season = extract(year from timezone('Asia/Seoul', now()))::integer
      and standing.league_id in (select league_id from public.admin_football_leagues())
    where team.sportmonks_id is not null
    order by team.id
  loop
    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', sync_secret
      ),
      body := jsonb_build_object(
        'teamId', target_team.id,
        'season', target_team.season,
        'leagueId', target_team.league_id,
        'force', true
      ),
      timeout_milliseconds := 120000
    );
    request_count := request_count + 1;
  end loop;

  return request_count;
exception
  when others then
    raise warning 'KickON scheduled squad sync enqueue failed: %', sqlerrm;
    return 0;
end;
$$;
create or replace function public.invoke_daily_team_metrics_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_function_url text;
  function_url text;
  sync_secret text;
  request_id bigint;
  target_scope record;
begin
  select decrypted_secret into live_function_url
  from vault.decrypted_secrets
  where name = 'kickon_live_football_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'kickon_football_sync_secret'
  limit 1;

  if live_function_url is null or sync_secret is null then
    raise warning 'KickON team metrics sync Vault secrets are missing';
    return null;
  end if;

  function_url := regexp_replace(
    live_function_url,
    '/sync-live-football$',
    '/sync-team-metrics'
  );

  for target_scope in
    select distinct standing.season, standing.league_id, settings.provider_league_id, catalog.provider_season_id
    from public.league_standings standing
    join public.admin_football_leagues() settings
      on settings.league_id = standing.league_id
    join public.football_provider_seasons catalog
      on catalog.provider = 'sportmonks' and catalog.provider_league_id = settings.provider_league_id
      and catalog.season_name = standing.season::text
    where standing.season = extract(year from timezone('Asia/Seoul', now()))::integer
    order by standing.league_id
  loop
    select net.http_post(
      url := function_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', sync_secret),
      body := jsonb_build_object('force', true, 'season', target_scope.season,
        'leagueId', target_scope.league_id, 'providerLeagueId', target_scope.provider_league_id,
        'seasonId', target_scope.provider_season_id), timeout_milliseconds := 120000
    ) into request_id;
  end loop;

  return request_id;
exception
  when others then
    raise warning 'KickON daily team metrics sync enqueue failed: %', sqlerrm;
    return null;
end;
$$;
revoke all on function public.invoke_scheduled_team_squad_sync() from public, anon, authenticated;
revoke all on function public.invoke_daily_team_metrics_sync() from public, anon, authenticated;

-- Keep cron cadence intact, but scope each request to its actual league.
create or replace function public.invoke_due_post_match_football_sync()
returns bigint language plpgsql security definer set search_path = '' as $$
declare target record; request_id bigint;
begin
  for target in
    select distinct config.provider_league_id, catalog.provider_season_id,
      extract(year from timezone('Asia/Seoul', fixture.kickoff_at))::integer as season
    from public.fixtures fixture
    join public.admin_football_leagues() config on config.league_id = fixture.league_id
    join public.football_provider_seasons catalog on catalog.provider = 'sportmonks'
      and catalog.provider_league_id = config.provider_league_id
      and catalog.season_name = extract(year from timezone('Asia/Seoul', fixture.kickoff_at))::integer::text
    where fixture.status = 'FINISHED' and fixture.post_match_sync_due_at <= now()
      and fixture.post_match_synced_at is null
  loop
    request_id := public.invoke_football_data_sync(jsonb_build_object(
      'leagueId', target.provider_league_id, 'seasonId', target.provider_season_id,
      'season', target.season, 'postMatch', true, 'syncLineups', false));
  end loop;
  return request_id;
end;
$$;
revoke all on function public.invoke_due_post_match_football_sync() from public, anon, authenticated;

create or replace function public.invoke_live_football_sync()
returns void language plpgsql security definer set search_path = '' as $$
declare function_url text; sync_secret text; target record;
begin
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'kickon_live_football_sync_url' limit 1;
  select decrypted_secret into sync_secret from vault.decrypted_secrets where name = 'kickon_football_sync_secret' limit 1;
  if function_url is null or sync_secret is null then
    raise warning 'KickON live football sync Vault secrets are missing'; return;
  end if;
  for target in
    select distinct standing.season, config.provider_league_id, catalog.provider_season_id
    from public.league_standings standing
    join public.admin_football_leagues() config on config.league_id = standing.league_id
    join public.football_provider_seasons catalog on catalog.provider = 'sportmonks'
      and catalog.provider_league_id = config.provider_league_id and catalog.season_name = standing.season::text
    where standing.season = extract(year from timezone('Asia/Seoul', now()))::integer
  loop
    perform net.http_post(url := function_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', sync_secret),
      body := jsonb_build_object('pollCount', 11, 'leagueId', target.provider_league_id,
        'seasonId', target.provider_season_id, 'season', target.season), timeout_milliseconds := 85000);
  end loop;
exception when others then raise warning 'KickON live football sync enqueue failed: %', sqlerrm;
end;
$$;
revoke all on function public.invoke_live_football_sync() from public, anon, authenticated;
comment on function public.invoke_live_football_sync() is 'Polls each registered supported league independently, preserving eleven incremental polls per minute.';

create or replace function public.invoke_initial_football_history_backfill()
returns bigint language plpgsql security definer set search_path = '' as $$
declare target record; request_id bigint;
begin
  for target in
    select distinct standing.season, standing.league_id, config.provider_league_id, catalog.provider_season_id
    from public.league_standings standing
    join public.admin_football_leagues() config on config.league_id = standing.league_id
    join public.football_provider_seasons catalog on catalog.provider = 'sportmonks'
      and catalog.provider_league_id = config.provider_league_id and catalog.season_name = standing.season::text
    where standing.season = extract(year from timezone('Asia/Seoul', now()))::integer
      and not exists (select 1 from public.football_sync_state state
        where state.league_id = standing.league_id and state.season = standing.season
          and state.sync_key like 'sportmonks-history-%' and state.last_succeeded_at is not null)
  loop
    request_id := public.invoke_football_data_sync(jsonb_build_object('mode', 'backfill-history',
      'leagueId', target.provider_league_id, 'seasonId', target.provider_season_id, 'season', target.season));
  end loop;
  return request_id;
end;
$$;
revoke all on function public.invoke_initial_football_history_backfill() from public, anon, authenticated;

-- Service-only one-shot backfill must explicitly select a season and league.
create or replace function public.invoke_fixture_goal_backfill(target_limit integer default 500)
returns bigint language plpgsql security definer set search_path = '' as $$
begin raise exception 'SEASON_AND_LEAGUE_REQUIRED: use invoke_fixture_goal_backfill(limit, season, league_id)'; end;
$$;
revoke all on function public.invoke_fixture_goal_backfill(integer) from public, anon, authenticated;
grant execute on function public.invoke_fixture_goal_backfill(integer) to service_role;
create or replace function public.invoke_fixture_goal_backfill(target_limit integer, p_season integer, p_league_id text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare function_url text; sync_secret text; provider_league bigint; provider_season bigint; request_id bigint;
begin
  perform public.admin_assert_football_scope(p_season, p_league_id);
  select config.provider_league_id, catalog.provider_season_id into provider_league, provider_season
  from public.admin_football_leagues() config
  join public.football_provider_seasons catalog on catalog.provider = 'sportmonks'
    and catalog.provider_league_id = config.provider_league_id and catalog.season_name = p_season::text
  where config.league_id = p_league_id;
  if provider_season is null then raise exception 'PROVIDER_SEASON_NOT_FOUND'; end if;
  select decrypted_secret into function_url from vault.decrypted_secrets where name = 'kickon_live_football_sync_url' limit 1;
  select decrypted_secret into sync_secret from vault.decrypted_secrets where name = 'kickon_football_sync_secret' limit 1;
  if function_url is null or sync_secret is null then raise exception 'KickON live football sync Vault secrets are missing'; end if;
  select net.http_post(url := function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', sync_secret),
    body := jsonb_build_object('mode', 'backfill-goals', 'limit', least(1000, greatest(target_limit, 1)),
      'leagueId', provider_league, 'seasonId', provider_season, 'season', p_season), timeout_milliseconds := 60000) into request_id;
  return request_id;
end;
$$;
revoke all on function public.invoke_fixture_goal_backfill(integer,integer,text) from public, anon, authenticated;
grant execute on function public.invoke_fixture_goal_backfill(integer,integer,text) to service_role;

-- Keep existing role/capability RLS policies. They do not restrict league IDs.
notify pgrst, 'reload schema';
commit;

-- Allow operators to correct a fixture venue and its GPS attendance boundary.
-- The fixture-level coordinates take precedence over the stadium catalog so a
-- one-off venue change never changes another fixture at the same stadium.

alter table public.fixtures
  add column if not exists attendance_latitude double precision,
  add column if not exists attendance_longitude double precision,
  add column if not exists attendance_radius_meters integer not null default 300;

alter table public.fixtures
  drop constraint if exists fixtures_attendance_latitude_check,
  drop constraint if exists fixtures_attendance_longitude_check,
  drop constraint if exists fixtures_attendance_radius_check,
  drop constraint if exists fixtures_attendance_coordinates_pair_check;

alter table public.fixtures
  add constraint fixtures_attendance_latitude_check
    check (attendance_latitude is null or attendance_latitude between -90 and 90),
  add constraint fixtures_attendance_longitude_check
    check (attendance_longitude is null or attendance_longitude between -180 and 180),
  add constraint fixtures_attendance_radius_check
    check (attendance_radius_meters between 50 and 5000),
  add constraint fixtures_attendance_coordinates_pair_check
    check ((attendance_latitude is null) = (attendance_longitude is null));

comment on column public.fixtures.attendance_latitude is
  'Fixture-specific GPS attendance latitude. Falls back to the selected stadium latitude when null.';
comment on column public.fixtures.attendance_longitude is
  'Fixture-specific GPS attendance longitude. Falls back to the selected stadium longitude when null.';
comment on column public.fixtures.attendance_radius_meters is
  'Maximum GPS attendance distance in meters for this fixture.';

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
      when 'stadium_id' then new.stadium_id := active_override.override_value #>> '{}';
      when 'attendance_latitude' then new.attendance_latitude := (active_override.override_value #>> '{}')::double precision;
      when 'attendance_longitude' then new.attendance_longitude := (active_override.override_value #>> '{}')::double precision;
      when 'attendance_radius_meters' then new.attendance_radius_meters := (active_override.override_value #>> '{}')::integer;
      else null;
    end case;
  end loop;
  return new;
end;
$$;

create or replace function public.admin_update_fixture_attendance_location(
  p_fixture_id text,
  p_stadium_id text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_fixture_id text := trim(coalesce(p_fixture_id, ''));
  normalized_stadium_id text := trim(coalesce(p_stadium_id, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  current_fixture public.fixtures;
  current_season integer;
  before_value jsonb;
  after_value jsonb;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;

  if normalized_fixture_id !~ '^[A-Za-z0-9_-]{1,160}$'
    or normalized_stadium_id !~ '^[A-Za-z0-9_-]{1,160}$'
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_radius_meters is null or p_radius_meters not between 50 and 5000
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_FIXTURE_ATTENDANCE_LOCATION';
  end if;

  if not exists (
    select 1 from public.stadiums stadium
    where stadium.id = normalized_stadium_id
  ) then
    raise exception 'STADIUM_NOT_FOUND';
  end if;

  select fixture.*
  into current_fixture
  from public.fixtures fixture
  where fixture.id = normalized_fixture_id
  for update;

  if not found then
    raise exception 'FIXTURE_NOT_FOUND';
  end if;

  current_season := extract(year from current_fixture.kickoff_at at time zone 'Asia/Seoul')::integer;
  before_value := jsonb_build_object(
    'stadiumId', current_fixture.stadium_id,
    'latitude', coalesce(current_fixture.attendance_latitude, (select stadium.latitude from public.stadiums stadium where stadium.id = current_fixture.stadium_id)),
    'longitude', coalesce(current_fixture.attendance_longitude, (select stadium.longitude from public.stadiums stadium where stadium.id = current_fixture.stadium_id)),
    'radiusMeters', current_fixture.attendance_radius_meters
  );

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  )
  select
    'fixture', normalized_fixture_id, current_season, current_fixture.league_id,
    change.field_path, change.original_value, change.override_value,
    normalized_reason, true, current_actor
  from (values
    ('stadium_id', to_jsonb(current_fixture.stadium_id), to_jsonb(normalized_stadium_id)),
    ('attendance_latitude', to_jsonb(current_fixture.attendance_latitude), to_jsonb(p_latitude)),
    ('attendance_longitude', to_jsonb(current_fixture.attendance_longitude), to_jsonb(p_longitude)),
    ('attendance_radius_meters', to_jsonb(current_fixture.attendance_radius_meters), to_jsonb(p_radius_meters))
  ) as change(field_path, original_value, override_value)
  on conflict (entity_type, entity_id, season, league_id, field_path)
    where released_at is null
  do update set
    override_value = excluded.override_value,
    reason = excluded.reason,
    blocks_sync = true,
    updated_at = now();

  update public.fixtures fixture
  set stadium_id = normalized_stadium_id,
      attendance_latitude = p_latitude,
      attendance_longitude = p_longitude,
      attendance_radius_meters = p_radius_meters,
      updated_at = now()
  where fixture.id = normalized_fixture_id;

  after_value := jsonb_build_object(
    'stadiumId', normalized_stadium_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'radiusMeters', p_radius_meters,
    'syncBlocked', true
  );

  perform public.data_center_write_audit(
    'FIXTURE_ATTENDANCE_LOCATION_UPDATED',
    'fixture',
    normalized_fixture_id,
    before_value,
    after_value,
    normalized_reason
  );

  return true;
end;
$$;

revoke all on function public.admin_update_fixture_attendance_location(
  text, text, double precision, double precision, integer, text
) from public, anon;
grant execute on function public.admin_update_fixture_attendance_location(
  text, text, double precision, double precision, integer, text
) to authenticated;

create or replace function public.create_gps_attendance(
  target_fixture_id text,
  current_latitude double precision,
  current_longitude double precision
)
returns public.attendances
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fixture public.fixtures;
  target_stadium public.stadiums;
  profile_team_id text;
  verification_latitude double precision;
  verification_longitude double precision;
  verification_radius integer;
  calculated_distance double precision;
  created_attendance public.attendances;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if current_latitude not between -90 and 90
    or current_longitude not between -180 and 180 then
    raise exception 'INVALID_LOCATION';
  end if;

  select team_id into profile_team_id
  from public.profiles
  where id = auth.uid();

  select * into target_fixture
  from public.fixtures
  where id = target_fixture_id;
  if not found then raise exception 'FIXTURE_NOT_FOUND'; end if;

  if profile_team_id is null or profile_team_id not in (
    target_fixture.home_team_id,
    target_fixture.away_team_id
  ) then
    raise exception 'TEAM_NOT_IN_FIXTURE';
  end if;
  if target_fixture.status = 'CANCELED' then
    raise exception 'FIXTURE_CANCELED';
  end if;
  if (now() at time zone 'Asia/Seoul')::date
    <> (target_fixture.kickoff_at at time zone 'Asia/Seoul')::date then
    raise exception 'ATTENDANCE_NOT_MATCHDAY';
  end if;
  if now() >= target_fixture.kickoff_at then
    raise exception 'ATTENDANCE_TOO_LATE';
  end if;

  select * into target_stadium
  from public.stadiums
  where id = target_fixture.stadium_id;
  if not found then raise exception 'STADIUM_NOT_FOUND'; end if;

  verification_latitude := coalesce(target_fixture.attendance_latitude, target_stadium.latitude);
  verification_longitude := coalesce(target_fixture.attendance_longitude, target_stadium.longitude);
  verification_radius := coalesce(target_fixture.attendance_radius_meters, 300);

  calculated_distance := 6371000 * 2 * asin(sqrt(least(1,
    power(sin(radians(verification_latitude - current_latitude) / 2), 2) +
    cos(radians(current_latitude)) * cos(radians(verification_latitude)) *
    power(sin(radians(verification_longitude - current_longitude) / 2), 2)
  )));
  if calculated_distance > verification_radius then
    raise exception 'ATTENDANCE_TOO_FAR';
  end if;

  insert into public.attendances (
    user_id, fixture_id, team_id, stadium_id, latitude, longitude,
    distance_from_stadium, verification_type, result
  ) values (
    auth.uid(), target_fixture.id, profile_team_id, target_fixture.stadium_id,
    current_latitude, current_longitude, round(calculated_distance), 'GPS',
    case
      when target_fixture.status <> 'FINISHED' then 'PENDING'
      when target_fixture.home_score = target_fixture.away_score then 'DRAW'
      when profile_team_id = target_fixture.home_team_id
        and target_fixture.home_score > target_fixture.away_score then 'WIN'
      when profile_team_id = target_fixture.away_team_id
        and target_fixture.away_score > target_fixture.home_score then 'WIN'
      else 'LOSS'
    end
  )
  returning * into created_attendance;

  return created_attendance;
exception
  when unique_violation then raise exception 'ALREADY_VERIFIED';
end;
$$;

revoke all on function public.create_gps_attendance(
  text, double precision, double precision
) from public, anon;
grant execute on function public.create_gps_attendance(
  text, double precision, double precision
) to authenticated;

comment on function public.create_gps_attendance(
  text, double precision, double precision
) is 'Matchday before kickoff, inside the fixture-specific attendance boundary or the selected stadium fallback.';

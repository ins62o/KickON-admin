-- Edit a fixture's kickoff, venue, and GPS attendance boundary as one audited
-- operation. Every changed field remains protected from provider synchronization.

create or replace function public.admin_update_fixture_schedule(
  p_fixture_id text,
  p_kickoff_at timestamp with time zone,
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
    or p_kickoff_at is null
    or extract(year from p_kickoff_at at time zone 'Asia/Seoul') not between 2020 and 2200
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_radius_meters is null or p_radius_meters not between 50 and 5000
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_FIXTURE_SCHEDULE';
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
    'kickoffAt', current_fixture.kickoff_at,
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
    ('kickoff_at', to_jsonb(current_fixture.kickoff_at), to_jsonb(p_kickoff_at)),
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
  set kickoff_at = p_kickoff_at,
      stadium_id = normalized_stadium_id,
      attendance_latitude = p_latitude,
      attendance_longitude = p_longitude,
      attendance_radius_meters = p_radius_meters,
      updated_at = now()
  where fixture.id = normalized_fixture_id;

  after_value := jsonb_build_object(
    'kickoffAt', p_kickoff_at,
    'stadiumId', normalized_stadium_id,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'radiusMeters', p_radius_meters,
    'syncBlocked', true
  );

  perform public.data_center_write_audit(
    'FIXTURE_SCHEDULE_UPDATED',
    'fixture',
    normalized_fixture_id,
    before_value,
    after_value,
    normalized_reason
  );

  return true;
end;
$$;

revoke all on function public.admin_update_fixture_schedule(
  text, timestamp with time zone, text, double precision, double precision, integer, text
) from public, anon;
grant execute on function public.admin_update_fixture_schedule(
  text, timestamp with time zone, text, double precision, double precision, integer, text
) to authenticated;

comment on function public.admin_update_fixture_schedule(
  text, timestamp with time zone, text, double precision, double precision, integer, text
) is 'Audited fixture kickoff, venue, and GPS attendance boundary update protected from provider synchronization.';

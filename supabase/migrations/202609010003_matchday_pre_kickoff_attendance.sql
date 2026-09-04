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

  calculated_distance := 6371000 * 2 * asin(sqrt(least(1,
    power(sin(radians(target_stadium.latitude - current_latitude) / 2), 2) +
    cos(radians(current_latitude)) * cos(radians(target_stadium.latitude)) *
    power(sin(radians(target_stadium.longitude - current_longitude) / 2), 2)
  )));
  if calculated_distance > 300 then
    raise exception 'ATTENDANCE_TOO_FAR';
  end if;

  insert into public.attendances (
    user_id,
    fixture_id,
    team_id,
    stadium_id,
    latitude,
    longitude,
    distance_from_stadium,
    verification_type,
    result
  ) values (
    auth.uid(),
    target_fixture.id,
    profile_team_id,
    target_fixture.stadium_id,
    current_latitude,
    current_longitude,
    round(calculated_distance),
    'GPS',
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
  text,
  double precision,
  double precision
) from public;
grant execute on function public.create_gps_attendance(
  text,
  double precision,
  double precision
) to authenticated;

comment on function public.create_gps_attendance(
  text,
  double precision,
  double precision
) is 'Matchday from 00:00 Asia/Seoul until kickoff, within a 300m radius.';

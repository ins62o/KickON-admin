begin;

create or replace function public.admin_get_attendance_records(
  p_attendance_id uuid,
  p_query text,
  p_offset integer,
  p_limit integer,
  p_team_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := '%' || left(trim(coalesce(p_query, '')), 200) || '%';
  v_result jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.admin_has_capability('users.read') then
    raise exception 'USER_ADMIN_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  with matching as (
    select attendance.*, profile.nickname as user_name, team.name as team_name,
      coalesce(stadium.name_ko, stadium.name) as stadium_name,
      coalesce(stadium.address_ko, stadium.address) as stadium_address,
      case when fixture.id is null then null else jsonb_build_object(
        'league_id', fixture.league_id, 'round', fixture.round,
        'home_team_name', home_team.name, 'away_team_name', away_team.name,
        'kickoff_at', fixture.kickoff_at, 'status', fixture.status,
        'home_score', fixture.home_score, 'away_score', fixture.away_score,
        'attendance_latitude', fixture.attendance_latitude,
        'attendance_longitude', fixture.attendance_longitude,
        'attendance_radius_meters', fixture.attendance_radius_meters
      ) end as fixture
    from public.attendances attendance
    left join public.profiles profile on profile.id = attendance.user_id
    left join public.teams team on team.id = attendance.team_id
    left join public.stadiums stadium on stadium.id = attendance.stadium_id
    left join public.fixtures fixture on fixture.id = attendance.fixture_id
    left join public.teams home_team on home_team.id = fixture.home_team_id
    left join public.teams away_team on away_team.id = fixture.away_team_id
    where (p_attendance_id is null or attendance.id = p_attendance_id)
      and (nullif(p_team_id, '') is null or attendance.team_id = p_team_id)
      and (p_attendance_id is not null or profile.nickname ilike v_query
        or attendance.user_id::text ilike v_query or team.name ilike v_query
        or coalesce(stadium.name_ko, stadium.name) ilike v_query
        or home_team.name ilike v_query or away_team.name ilike v_query
        or attendance.fixture_id ilike v_query)
  ), page_rows as (
    select * from matching
    order by verified_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'records', coalesce((
      select jsonb_agg(to_jsonb(attendance) order by attendance.verified_at desc, attendance.id desc)
      from page_rows attendance
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Keep existing four-argument callers working without an ambiguous defaulted overload.
create or replace function public.admin_get_attendance_records(
  p_attendance_id uuid default null,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.admin_get_attendance_records(p_attendance_id, p_query, p_offset, p_limit, null::text);
$$;

revoke all on function public.admin_get_attendance_records(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.admin_get_attendance_records(uuid, text, integer, integer, text) to authenticated, service_role;

comment on function public.admin_get_attendance_records(uuid, text, integer, integer, text) is
  'Paged attendance history filtered by the team recorded at verification, with user administrator capability checks.';

notify pgrst, 'reload schema';
commit;

begin;

-- Read all teams' activity through capability-checked RPCs. Do not broaden
-- the mobile application's table policies, especially GPS attendance data.
create or replace function public.admin_get_community_posts(
  p_post_id uuid default null,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 50
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
    and not public.admin_has_capability('moderation.read') then
    raise exception 'MODERATION_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  with matching as (
    select post.*, author.nickname as author_name, team.name as team_name
    from public.posts post
    left join public.profiles author on author.id = post.author_id
    left join public.teams team on team.id = post.team_id
    where (p_post_id is null or post.id = p_post_id)
      and (p_post_id is not null or post.title ilike v_query
        or post.content ilike v_query or author.nickname ilike v_query
        or post.author_id::text ilike v_query or team.name ilike v_query)
  ), page_rows as (
    select * from matching
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'records', coalesce((
      select jsonb_agg(
        to_jsonb(post) || jsonb_build_object(
          'like_count', (select count(*) from public.post_likes liked where liked.post_id = post.id),
          'comment_count', (select count(*) from public.comments comment where comment.post_id = post.id),
          'comments', case when p_post_id is null then '[]'::jsonb else coalesce((
            select jsonb_agg(
              to_jsonb(comment) || jsonb_build_object('author_name', author.nickname)
              order by comment.created_at, comment.id
            )
            from public.comments comment
            left join public.profiles author on author.id = comment.user_id
            where comment.post_id = post.id
          ), '[]'::jsonb) end
        ) order by post.created_at desc, post.id desc
      ) from page_rows post
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_get_attendance_records(
  p_attendance_id uuid default null,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 50
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

revoke all on function public.admin_get_community_posts(uuid, text, integer, integer) from public, anon;
revoke all on function public.admin_get_attendance_records(uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_get_community_posts(uuid, text, integer, integer) to authenticated, service_role;
grant execute on function public.admin_get_attendance_records(uuid, text, integer, integer) to authenticated, service_role;

comment on function public.admin_get_community_posts(uuid, text, integer, integer) is
  'Paged community history and single-post details including all comments for moderation readers.';
comment on function public.admin_get_attendance_records(uuid, text, integer, integer) is
  'Paged attendance history and GPS verification details for user administrators.';

notify pgrst, 'reload schema';
commit;

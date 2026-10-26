create or replace function public.get_community_user_profile(
  target_user_id uuid
)
returns table (
  user_id uuid,
  nickname text,
  team_id text,
  fan_level_id text,
  post_count bigint,
  comment_count bigint,
  attendance_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id as user_id,
    profile.nickname,
    profile.team_id,
    public.fan_level_for_score(
      activity.post_count + activity.comment_count + activity.attendance_count
    ) as fan_level_id,
    activity.post_count,
    activity.comment_count,
    activity.attendance_count
  from public.profiles profile
  cross join lateral (
    select
      (select count(*) from public.posts where author_id = profile.id)::bigint
        as post_count,
      (select count(*) from public.comments where user_id = profile.id)::bigint
        as comment_count,
      (select count(*) from public.attendances where user_id = profile.id)::bigint
        as attendance_count
  ) activity
  where profile.id = target_user_id
    and profile.team_id is not null
    and profile.nickname <> ''
    and auth.uid() is not null;
$$;

create or replace function public.get_community_user_attendances(
  target_user_id uuid
)
returns table (
  attendance_id uuid,
  team_id text,
  verified_at timestamptz,
  result text,
  fixture_id text,
  league_id text,
  round integer,
  home_team_id text,
  away_team_id text,
  stadium_id text,
  kickoff_at timestamptz,
  fixture_status text,
  home_score integer,
  away_score integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attendance.id as attendance_id,
    attendance.team_id,
    attendance.verified_at,
    attendance.result,
    fixture.id as fixture_id,
    fixture.league_id,
    fixture.round,
    fixture.home_team_id,
    fixture.away_team_id,
    fixture.stadium_id,
    fixture.kickoff_at,
    fixture.status as fixture_status,
    fixture.home_score,
    fixture.away_score
  from public.attendances attendance
  join public.fixtures fixture on fixture.id = attendance.fixture_id
  where attendance.user_id = target_user_id
    and auth.uid() is not null
  order by fixture.kickoff_at desc
  limit 100;
$$;

revoke execute on function public.get_community_user_profile(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_community_user_attendances(uuid)
  from public, anon, authenticated;

grant execute on function public.get_community_user_profile(uuid)
  to authenticated;
grant execute on function public.get_community_user_attendances(uuid)
  to authenticated;

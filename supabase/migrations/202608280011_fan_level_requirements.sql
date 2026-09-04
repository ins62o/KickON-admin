create or replace function public.fan_level_for_activity(
  post_count bigint,
  attendance_count bigint
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(post_count, 0) >= 50
      and coalesce(attendance_count, 0) >= 10 then 'LEGEND'
    when coalesce(post_count, 0) >= 30
      and coalesce(attendance_count, 0) >= 5 then 'CORE_FAN'
    when coalesce(post_count, 0) >= 10
      and coalesce(attendance_count, 0) >= 3 then 'PASSIONATE_FAN'
    when coalesce(post_count, 0) >= 3
      and coalesce(attendance_count, 0) >= 1 then 'SUPPORTER'
    else 'FAN'
  end;
$$;

revoke execute on function public.fan_level_for_activity(bigint, bigint)
  from public, anon;
grant execute on function public.fan_level_for_activity(bigint, bigint)
  to authenticated, service_role;

create or replace function public.fan_level_for_user(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.fan_level_for_activity(
    (select count(*) from public.posts where author_id = target_user_id),
    (select count(*) from public.attendances where user_id = target_user_id)
  );
$$;

revoke execute on function public.fan_level_for_user(uuid)
  from public, anon;
grant execute on function public.fan_level_for_user(uuid)
  to authenticated, service_role;

create or replace view public.community_post_feed
with (security_invoker = true)
as
select
  post.id,
  post.board,
  post.team_id,
  post.category,
  post.title,
  post.content,
  post.image_urls,
  post.author_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  post.created_at,
  post.view_count,
  (select count(*) from public.comments where post_id = post.id)::integer as comment_count,
  (select count(*) from public.post_likes where post_id = post.id)::integer as like_count
from public.posts post
join public.profiles profile on profile.id = post.author_id;

create or replace view public.community_comment_feed
with (security_invoker = true)
as
select
  comment.id,
  comment.post_id,
  post.title as post_title,
  comment.user_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  comment.content,
  comment.created_at
from public.comments comment
join public.posts post on post.id = comment.post_id
join public.profiles profile on profile.id = comment.user_id;

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
    public.fan_level_for_activity(
      activity.post_count,
      activity.attendance_count
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

drop function public.fan_level_for_score(bigint);

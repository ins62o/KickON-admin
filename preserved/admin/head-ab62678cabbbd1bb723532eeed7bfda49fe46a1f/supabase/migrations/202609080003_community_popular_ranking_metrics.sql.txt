begin;

-- Test accounts must be marked explicitly by a trusted backend or migration.
-- Nicknames, post titles, email domains, and other heuristics are intentionally
-- not used by the popularity aggregation.
alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

revoke update (is_test_account) on public.profiles from anon, authenticated;
grant select (is_test_account) on public.profiles to anon;

comment on column public.profiles.is_test_account is
  'Explicit trusted marker. Reactions from marked accounts do not contribute to community popularity metrics.';

-- Keep the existing feed contract and append ranking-only metrics. Raw display
-- counts remain unchanged. Deleted likes/comments disappear with their rows;
-- moderated comments are omitted here just as they are from the comment feed.
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
  case
    when post.category = 'NOTICE' then '관리자'
    else profile.nickname
  end as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  post.created_at,
  post.view_count,
  (
    select count(*)
    from public.comments comment
    where comment.post_id = post.id
      and comment.moderation_status = 'VISIBLE'
  )::integer as comment_count,
  (
    select count(*)
    from public.post_likes post_like
    where post_like.post_id = post.id
  )::integer as like_count,
  post.emoticon_key,
  cardinality(post.image_urls) > 0 as has_images,
  (
    select count(distinct post_like.user_id)
    from public.post_likes post_like
    join public.profiles reactor on reactor.id = post_like.user_id
    where post_like.post_id = post.id
      and post_like.user_id <> post.author_id
      and not reactor.is_test_account
  )::integer as ranking_like_count,
  (
    select count(distinct comment.user_id)
    from public.comments comment
    join public.profiles reactor on reactor.id = comment.user_id
    where comment.post_id = post.id
      and comment.moderation_status = 'VISIBLE'
      and comment.user_id <> post.author_id
      and not reactor.is_test_account
  )::integer as ranking_commenter_count,
  (
    select count(*)
    from (
      select post_like.user_id
      from public.post_likes post_like
      join public.profiles reactor on reactor.id = post_like.user_id
      where post_like.post_id = post.id
        and post_like.user_id <> post.author_id
        and not reactor.is_test_account
      union
      select comment.user_id
      from public.comments comment
      join public.profiles reactor on reactor.id = comment.user_id
      where comment.post_id = post.id
        and comment.moderation_status = 'VISIBLE'
        and comment.user_id <> post.author_id
        and not reactor.is_test_account
    ) unique_reactors
  )::integer as ranking_reactor_count
from public.posts post
join public.profiles profile on profile.id = post.author_id
where post.moderation_status = 'VISIBLE';

grant select on public.community_post_feed to anon, authenticated;

-- Search results use the same feed metrics so selecting the existing Popular
-- sort while searching cannot fall back to raw comment totals.
drop function if exists public.search_community_post_summaries(text, text, text);
create function public.search_community_post_summaries(
  target_board text,
  target_team_id text,
  search_query text
)
returns table (
  id uuid,
  board text,
  team_id text,
  category text,
  title text,
  content text,
  has_images boolean,
  author_id uuid,
  author_nickname text,
  author_team_id text,
  author_fan_level_id text,
  created_at timestamptz,
  view_count integer,
  comment_count integer,
  like_count integer,
  emoticon_key text,
  ranking_like_count integer,
  ranking_commenter_count integer,
  ranking_reactor_count integer
)
language sql
stable
set search_path = ''
as $$
  select
    post.id,
    post.board,
    post.team_id,
    post.category,
    post.title,
    post.content,
    post.has_images,
    post.author_id,
    post.author_nickname,
    post.author_team_id,
    post.author_fan_level_id,
    post.created_at,
    post.view_count,
    post.comment_count,
    post.like_count,
    post.emoticon_key,
    post.ranking_like_count,
    post.ranking_commenter_count,
    post.ranking_reactor_count
  from public.community_post_feed post
  where post.board = target_board
    and (target_team_id is null or post.team_id = target_team_id)
    and char_length(trim(search_query)) between 1 and 50
    and (
      strpos(lower(post.title), lower(trim(search_query))) > 0 or
      strpos(lower(post.content), lower(trim(search_query))) > 0 or
      strpos(lower(post.author_nickname), lower(trim(search_query))) > 0
    )
  order by post.created_at desc
  limit 100;
$$;
revoke all on function public.search_community_post_summaries(text, text, text)
  from public;
grant execute on function public.search_community_post_summaries(
  text, text, text
) to anon, authenticated;

create or replace function public.is_current_user_blocking(
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_blocks user_block
      where user_block.blocker_user_id = (select auth.uid())
        and user_block.blocked_user_id = target_user_id
    );
$$;
revoke all on function public.is_current_user_blocking(uuid) from public;
grant execute on function public.is_current_user_blocking(uuid)
  to anon, authenticated;

-- The dedicated query ranks the complete eligible board population in the
-- database, instead of re-ranking whichever page of the latest feed happened
-- to be loaded by the client. RLS on the security-invoker feed remains active.
create or replace function public.get_community_popular_post_summaries(
  target_board text,
  target_team_id text default null,
  highlighted_only boolean default false
)
returns setof public.community_post_feed
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      feed as post_row,
      (
        (2 * feed.ranking_like_count + feed.ranking_commenter_count)::double precision
        / (
          1 + extract(epoch from (now() - feed.created_at))
            / (12 * 60 * 60)
        )
      ) as popularity_score
    from public.community_post_feed feed
    where feed.board = target_board
      and (target_board <> 'TEAM' or feed.team_id = target_team_id)
      and feed.created_at <= now()
      and feed.created_at > now() - interval '24 hours'
      and not public.is_current_user_blocking(feed.author_id)
      and (
        (target_board = 'LEAGUE'
          and feed.ranking_like_count >= 3
          and feed.ranking_reactor_count >= 5)
        or
        (target_board = 'TEAM'
          and feed.ranking_like_count >= 2
          and feed.ranking_reactor_count >= 3)
      )
  ), ranked as (
    select
      candidate.post_row,
      candidate.popularity_score,
      row_number() over (
        partition by (candidate.post_row).author_id
        order by
          candidate.popularity_score desc,
          (candidate.post_row).ranking_like_count desc,
          (candidate.post_row).created_at desc,
          (candidate.post_row).id asc
      ) as author_rank
    from candidates candidate
  )
  select ranked.post_row
  from ranked
  where not highlighted_only or ranked.author_rank = 1
  order by
    ranked.popularity_score desc,
    (ranked.post_row).ranking_like_count desc,
    (ranked.post_row).created_at desc,
    (ranked.post_row).id asc
  limit case when highlighted_only then 2 else null end;
$$;

revoke all on function public.get_community_popular_post_summaries(
  text, text, boolean
) from public;
grant execute on function public.get_community_popular_post_summaries(
  text, text, boolean
) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

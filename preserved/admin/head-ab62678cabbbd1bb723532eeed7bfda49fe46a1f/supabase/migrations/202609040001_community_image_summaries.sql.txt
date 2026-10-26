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
  (select count(*) from public.post_likes where post_id = post.id)::integer as like_count,
  post.emoticon_key,
  cardinality(post.image_urls) > 0 as has_images
from public.posts post
join public.profiles profile on profile.id = post.author_id;

grant select on public.community_post_feed to anon, authenticated;

create or replace function public.search_community_post_summaries(
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
  emoticon_key text
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
    post.emoticon_key
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
grant execute on function public.search_community_post_summaries(text, text, text)
  to anon, authenticated;

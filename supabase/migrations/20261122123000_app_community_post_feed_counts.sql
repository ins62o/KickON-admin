-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 12:30 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
-- OWNERSHIP: public.community_post_feed is an App-owned object read by the KICKON app (and by
-- search_community_posts, get_unread_community_notices, get_community_popular_post_summaries and
-- search_community_post_summaries). It is recorded here because the change was made from this session.
--
-- Why: the view is security_invoker, so each comment and like counted in its five aggregate subqueries
-- re-ran the row-level policies (can_current_user_access_app() and a parent-post visibility subquery per
-- row). As an app user a 20-post LEAGUE page took 81.7ms (production mean 158ms, max 3.1s), of which
-- about 70% was those per-row checks.
-- Change: the five counts move to SECURITY DEFINER helpers in a new schema community_private, which
-- PostgREST does not expose. The view keeps its columns, types, filters and caller-rights scan of posts
-- and profiles, so which posts a caller sees is unchanged. Likes and visible comments of a post the
-- caller can see are visible to that caller under the existing policies.
--
-- Verification on production: before applying, session-temporary copies matched the old view for the
-- owner (255 rows), an app user (183 rows, LEAGUE and TEAM) and anon (161 rows). The apply transaction
-- compared the whole output before and after the swap. As an app user afterwards: 20-post page 21.5ms
-- (was 81.7ms), whole LEAGUE board 151ms (was 512ms), get_community_popular_post_summaries 60ms.
-- fan_level_for_user is unchanged and is now most of the remaining time.
--
-- View definition before: md5 afb048bb027292cb64f82163f447fa9e. After: md5 9cd1e15ce648bba5a91d9c8f7144957f.
-- Replaying is refused by the VIEW_DRIFT / SCHEMA_EXISTS guards.
-- Rollback (not part of the change): recreate the previous view below, then drop schema community_private
-- cascade.

do $apply$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if md5(pg_get_viewdef('public.community_post_feed'::regclass, true)) <> 'afb048bb027292cb64f82163f447fa9e' then
    raise exception 'VIEW_DRIFT %', md5(pg_get_viewdef('public.community_post_feed'::regclass, true));
  end if;
  if exists (select 1 from pg_namespace where nspname = 'community_private') then
    raise exception 'SCHEMA_EXISTS';
  end if;

  select jsonb_agg(to_jsonb(f) order by f.id) into v_before from public.community_post_feed f;

  create schema community_private;
  revoke all on schema community_private from public;
  grant usage on schema community_private to anon, authenticated, service_role;

  -- Counts only for posts the caller already sees through the view; likes and visible comments of a
  -- visible post are visible to every caller who can see the post.
  create function community_private.visible_comment_count(p_post_id uuid) returns integer
  language sql stable security definer set search_path to '' cost 100 as $f$
    select count(*)::integer from public.comments c
    where c.post_id = p_post_id and c.moderation_status = 'VISIBLE'
  $f$;
  create function community_private.like_count(p_post_id uuid) returns integer
  language sql stable security definer set search_path to '' cost 100 as $f$
    select count(*)::integer from public.post_likes l where l.post_id = p_post_id
  $f$;
  create function community_private.ranking_like_count(p_post_id uuid, p_author_id uuid) returns integer
  language sql stable security definer set search_path to '' cost 100 as $f$
    select count(distinct l.user_id)::integer from public.post_likes l
    join public.profiles r on r.id = l.user_id
    where l.post_id = p_post_id and l.user_id <> p_author_id and not r.is_test_account
  $f$;
  create function community_private.ranking_commenter_count(p_post_id uuid, p_author_id uuid) returns integer
  language sql stable security definer set search_path to '' cost 100 as $f$
    select count(distinct c.user_id)::integer from public.comments c
    join public.profiles r on r.id = c.user_id
    where c.post_id = p_post_id and c.moderation_status = 'VISIBLE' and c.user_id <> p_author_id and not r.is_test_account
  $f$;
  create function community_private.ranking_reactor_count(p_post_id uuid, p_author_id uuid) returns integer
  language sql stable security definer set search_path to '' cost 100 as $f$
    select count(*)::integer from (
      select l.user_id from public.post_likes l join public.profiles r on r.id = l.user_id
      where l.post_id = p_post_id and l.user_id <> p_author_id and not r.is_test_account
      union
      select c.user_id from public.comments c join public.profiles r on r.id = c.user_id
      where c.post_id = p_post_id and c.moderation_status = 'VISIBLE' and c.user_id <> p_author_id and not r.is_test_account
    ) unique_reactors
  $f$;
  revoke all on all functions in schema community_private from public;
  grant execute on all functions in schema community_private to anon, authenticated, service_role;

  create or replace view public.community_post_feed with (security_invoker = true) as
   SELECT post.id, post.board, post.team_id, post.category, post.title, post.content, post.image_urls, post.author_id,
      CASE WHEN post.category = 'NOTICE'::text THEN '관리자'::text ELSE profile.nickname END AS author_nickname,
      profile.team_id AS author_team_id,
      public.fan_level_for_user(profile.id) AS author_fan_level_id,
      post.created_at, post.view_count,
      community_private.visible_comment_count(post.id) AS comment_count,
      community_private.like_count(post.id) AS like_count,
      post.emoticon_key,
      cardinality(post.image_urls) > 0 AS has_images,
      community_private.ranking_like_count(post.id, post.author_id) AS ranking_like_count,
      community_private.ranking_commenter_count(post.id, post.author_id) AS ranking_commenter_count,
      community_private.ranking_reactor_count(post.id, post.author_id) AS ranking_reactor_count,
      profile.profile_icon_type AS author_profile_icon_type
     FROM public.posts post JOIN public.profiles profile ON profile.id = post.author_id
    WHERE post.moderation_status = 'VISIBLE'::text;

  select jsonb_agg(to_jsonb(f) order by f.id) into v_after from public.community_post_feed f;
  if v_after is distinct from v_before then raise exception 'OUTPUT_CHANGED'; end if;
end
$apply$;
select md5(pg_get_viewdef('public.community_post_feed'::regclass, true)) as after_viewdef_md5,
  (select count(*) from public.community_post_feed) as rows;

-- Previous definition:
-- create or replace view public.community_post_feed with (security_invoker = true) as
--  SELECT post.id, post.board, post.team_id, post.category, post.title, post.content, post.image_urls, post.author_id,
--     CASE WHEN post.category = 'NOTICE'::text THEN '관리자'::text ELSE profile.nickname END AS author_nickname,
--     profile.team_id AS author_team_id,
--     fan_level_for_user(profile.id) AS author_fan_level_id,
--     post.created_at, post.view_count,
--     (( SELECT count(*) FROM comments comment
--         WHERE comment.post_id = post.id AND comment.moderation_status = 'VISIBLE'::text))::integer AS comment_count,
--     (( SELECT count(*) FROM post_likes post_like WHERE post_like.post_id = post.id))::integer AS like_count,
--     post.emoticon_key,
--     cardinality(post.image_urls) > 0 AS has_images,
--     (( SELECT count(DISTINCT post_like.user_id) FROM post_likes post_like JOIN profiles reactor ON reactor.id = post_like.user_id
--         WHERE post_like.post_id = post.id AND post_like.user_id <> post.author_id AND NOT reactor.is_test_account))::integer AS ranking_like_count,
--     (( SELECT count(DISTINCT comment.user_id) FROM comments comment JOIN profiles reactor ON reactor.id = comment.user_id
--         WHERE comment.post_id = post.id AND comment.moderation_status = 'VISIBLE'::text AND comment.user_id <> post.author_id
--           AND NOT reactor.is_test_account))::integer AS ranking_commenter_count,
--     (( SELECT count(*) FROM ( SELECT post_like.user_id FROM post_likes post_like JOIN profiles reactor ON reactor.id = post_like.user_id
--           WHERE post_like.post_id = post.id AND post_like.user_id <> post.author_id AND NOT reactor.is_test_account
--         UNION
--         SELECT comment.user_id FROM comments comment JOIN profiles reactor ON reactor.id = comment.user_id
--           WHERE comment.post_id = post.id AND comment.moderation_status = 'VISIBLE'::text AND comment.user_id <> post.author_id
--             AND NOT reactor.is_test_account) unique_reactors))::integer AS ranking_reactor_count,
--     profile.profile_icon_type AS author_profile_icon_type
--    FROM posts post JOIN profiles profile ON profile.id = post.author_id
--   WHERE post.moderation_status = 'VISIBLE'::text;

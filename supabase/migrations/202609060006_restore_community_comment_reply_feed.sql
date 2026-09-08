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
  comment.created_at,
  comment.emoticon_key,
  comment.parent_comment_id,
  parent_profile.nickname as parent_author_nickname
from public.comments comment
join public.posts post on post.id = comment.post_id
join public.profiles profile on profile.id = comment.user_id
left join public.comments parent_comment
  on parent_comment.id = comment.parent_comment_id
left join public.profiles parent_profile
  on parent_profile.id = parent_comment.user_id
where comment.moderation_status = 'VISIBLE'
  and post.moderation_status = 'VISIBLE';

grant select on public.community_comment_feed to anon, authenticated;

notify pgrst, 'reload schema';

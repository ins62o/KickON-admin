alter table public.comments
  add column if not exists parent_comment_id uuid
  references public.comments(id) on delete cascade;

create index if not exists comments_parent_idx
  on public.comments(parent_comment_id, created_at);

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_post_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select comment.post_id, comment.parent_comment_id
  into parent_post_id, parent_parent_id
  from public.comments comment
  where comment.id = new.parent_comment_id;

  if parent_post_id is null or parent_post_id <> new.post_id then
    raise exception 'INVALID_PARENT_COMMENT';
  end if;

  if parent_parent_id is not null then
    raise exception 'NESTED_COMMENT_DEPTH_EXCEEDED';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_comment_parent()
  from public, anon, authenticated;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
before insert or update of parent_comment_id, post_id on public.comments
for each row execute function public.validate_comment_parent();

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
  on parent_profile.id = parent_comment.user_id;

grant select on public.community_comment_feed to anon, authenticated;

create or replace function public.create_community_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts;
  parent_author_id uuid;
  commenter_nickname text;
begin
  select * into target_post
  from public.posts
  where id = new.post_id;

  select nickname into commenter_nickname
  from public.profiles
  where id = new.user_id;

  if new.parent_comment_id is not null then
    select user_id into parent_author_id
    from public.comments
    where id = new.parent_comment_id;

    if parent_author_id is distinct from new.user_id then
      insert into public.notifications (
        user_id, type, title, body, data, dedupe_key
      )
      select
        parent_author_id,
        'COMMUNITY',
        '내 댓글에 답글이 달렸어요',
        coalesce(commenter_nickname, '팬') || ' · ' || left(new.content, 120),
        jsonb_build_object(
          'postId', new.post_id::text,
          'commentId', new.id::text
        ),
        'comment-reply:' || new.id::text
      where exists (
        select 1
        from public.notification_preferences preference
        where preference.user_id = parent_author_id
          and preference.community_notifications_enabled
      )
      on conflict (user_id, dedupe_key)
      where dedupe_key is not null
      do nothing;
    end if;
  end if;

  if target_post.author_id is distinct from new.user_id
    and target_post.author_id is distinct from parent_author_id then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      target_post.author_id,
      'COMMUNITY',
      '내 글에 새 댓글이 달렸어요',
      coalesce(commenter_nickname, '팬') || ' · ' || left(new.content, 120),
      jsonb_build_object(
        'postId', new.post_id::text,
        'commentId', new.id::text
      ),
      'comment:' || new.id::text
    where exists (
      select 1
      from public.notification_preferences preference
      where preference.user_id = target_post.author_id
        and preference.community_notifications_enabled
    )
    on conflict (user_id, dedupe_key)
    where dedupe_key is not null
    do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.create_community_comment_notification()
  from public, anon, authenticated;

drop trigger if exists comments_create_notification on public.comments;
create trigger comments_create_notification
after insert on public.comments
for each row execute function public.create_community_comment_notification();

create or replace function public.create_community_like_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts;
  liker_nickname text;
begin
  select * into target_post
  from public.posts
  where id = new.post_id;

  if target_post.author_id = new.user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.notification_preferences preference
    where preference.user_id = target_post.author_id
      and preference.community_notifications_enabled
  ) then
    return new;
  end if;

  select nickname into liker_nickname
  from public.profiles
  where id = new.user_id;

  insert into public.notifications (
    user_id, type, title, body, data, dedupe_key
  ) values (
    target_post.author_id,
    'COMMUNITY',
    '내 글에 좋아요가 눌렸어요',
    coalesce(liker_nickname, '팬') || '님이 내 글을 좋아합니다.',
    jsonb_build_object('postId', new.post_id::text),
    'post-like:' || new.post_id::text || ':' || new.user_id::text || ':' ||
      extract(epoch from new.created_at)::text
  );

  return new;
end;
$$;

revoke all on function public.create_community_like_notification()
  from public, anon, authenticated;

drop trigger if exists post_likes_create_notification on public.post_likes;
create trigger post_likes_create_notification
after insert on public.post_likes
for each row execute function public.create_community_like_notification();

comment on function public.create_community_comment_notification() is
  'Notifies a post author about comments and a parent comment author about replies when community notifications are enabled.';

comment on function public.create_community_like_notification() is
  'Notifies a post author when another user likes the post and community notifications are enabled.';

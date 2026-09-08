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
        coalesce(commenter_nickname, '팬') || ' : ' || left(new.content, 120),
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

comment on function public.create_community_comment_notification() is
  'Notifies post and parent-comment authors; reply bodies use the nickname : content format.';

create or replace function public.accept_signup_consents(
  terms_document_version text,
  privacy_document_version text,
  community_document_version text,
  age_document_version text,
  notifications_document_version text,
  notifications_enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  accepted_at timestamptz := now();
  updated_profile public.profiles;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(terms_document_version), '') is null
    or nullif(trim(privacy_document_version), '') is null
    or nullif(trim(community_document_version), '') is null
    or nullif(trim(age_document_version), '') is null
    or nullif(trim(notifications_document_version), '') is null then
    raise exception 'CONSENT_VERSION_REQUIRED';
  end if;

  insert into public.user_consents (
    user_id,
    document_type,
    document_version,
    agreed,
    agreed_at
  ) values
    (current_user_id, 'TERMS', terms_document_version, true, accepted_at),
    (current_user_id, 'PRIVACY', privacy_document_version, true, accepted_at),
    (current_user_id, 'COMMUNITY', community_document_version, true, accepted_at),
    (current_user_id, 'AGE', age_document_version, true, accepted_at),
    (
      current_user_id,
      'NOTIFICATIONS',
      notifications_document_version,
      notifications_enabled,
      accepted_at
    )
  on conflict (user_id, document_type, document_version)
  do update set
    agreed = excluded.agreed,
    agreed_at = excluded.agreed_at;

  update public.notification_preferences
  set
    match_notifications_enabled = notifications_enabled,
    lineup_notifications_enabled = notifications_enabled,
    goal_notifications_enabled = notifications_enabled,
    community_notifications_enabled = notifications_enabled
  where user_id = current_user_id;

  update public.profiles
  set
    signup_consented_at = accepted_at,
    terms_version = terms_document_version,
    privacy_version = privacy_document_version,
    community_policy_version = community_document_version,
    age_confirmed_at = accepted_at,
    registration_completed_at = coalesce(registration_completed_at, accepted_at)
  where id = current_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.accept_signup_consents(text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.accept_signup_consents(text, text, text, text, text, boolean)
  to authenticated;

create or replace function public.create_community_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts;
  commenter_nickname text;
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

  select nickname into commenter_nickname
  from public.profiles
  where id = new.user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    dedupe_key
  ) values (
    target_post.author_id,
    'COMMUNITY',
    '내 글에 새 댓글이 달렸어요',
    coalesce(commenter_nickname, '팬') || ' · ' || left(new.content, 120),
    jsonb_build_object('postId', new.post_id::text),
    'comment:' || new.id::text
  )
  on conflict (user_id, dedupe_key)
  where dedupe_key is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.create_community_comment_notification()
  from public, anon, authenticated;

drop trigger if exists comments_create_notification on public.comments;
create trigger comments_create_notification
after insert on public.comments
for each row execute function public.create_community_comment_notification();

comment on function public.create_community_comment_notification() is
  'Creates an in-app and push-ready notification for a post author when another user comments and community notifications are enabled.';

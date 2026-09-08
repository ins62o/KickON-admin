-- Allow administrators with moderation write access to create and permanently
-- delete NOTICE posts. Both mutations are audited before returning.

create or replace function public.admin_create_community_notice(
  target_board text,
  target_team_id text,
  notice_title text,
  notice_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_board text := upper(trim(coalesce(target_board, '')));
  normalized_team_id text := trim(coalesce(target_team_id, ''));
  normalized_title text := trim(coalesce(notice_title, ''));
  normalized_content text := trim(coalesce(notice_content, ''));
  actor_team_id text;
  resolved_team_id text;
  created_notice_id uuid;
begin
  if current_actor is null
    or not public.admin_has_capability('moderation.write')
  then
    raise exception 'ADMIN_PERMISSION_REQUIRED';
  end if;

  if normalized_board not in ('LEAGUE', 'TEAM') then
    raise exception 'INVALID_NOTICE_BOARD';
  end if;
  if char_length(normalized_title) not between 2 and 100
    or char_length(normalized_content) not between 5 and 10000
  then
    raise exception 'INVALID_NOTICE_CONTENT';
  end if;

  select profile.team_id
  into actor_team_id
  from public.profiles profile
  where profile.id = current_actor;

  resolved_team_id := case
    when normalized_board = 'TEAM' then normalized_team_id
    else actor_team_id
  end;

  if resolved_team_id is null or not exists (
    select 1 from public.teams team where team.id = resolved_team_id
  ) then
    raise exception 'VALID_NOTICE_TEAM_REQUIRED';
  end if;

  insert into public.posts (
    board, team_id, category, title, content, author_id,
    image_urls, moderation_status
  ) values (
    normalized_board, resolved_team_id, 'NOTICE', normalized_title,
    normalized_content, current_actor, '{}', 'VISIBLE'
  )
  returning id into created_notice_id;

  perform public.data_center_write_audit(
    'COMMUNITY_NOTICE_CREATED',
    'post',
    created_notice_id::text,
    null,
    jsonb_build_object(
      'board', normalized_board,
      'teamId', resolved_team_id,
      'title', normalized_title
    ),
    '관리자 공지 등록'
  );

  return created_notice_id;
end;
$$;

create or replace function public.admin_delete_community_notice(
  p_notice_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  before_row jsonb;
begin
  if current_actor is null
    or not public.admin_has_capability('moderation.write')
  then
    raise exception 'ADMIN_PERMISSION_REQUIRED';
  end if;

  select jsonb_build_object(
    'board', post.board,
    'teamId', post.team_id,
    'title', post.title,
    'authorId', post.author_id,
    'createdAt', post.created_at
  )
  into before_row
  from public.posts post
  where post.id = p_notice_id
    and post.category = 'NOTICE'
  for update;

  if before_row is null then
    raise exception 'NOTICE_NOT_FOUND';
  end if;

  perform public.data_center_write_audit(
    'COMMUNITY_NOTICE_DELETED',
    'post',
    p_notice_id::text,
    before_row,
    null,
    '관리자 공지 삭제'
  );

  delete from public.posts post
  where post.id = p_notice_id
    and post.category = 'NOTICE';

  return true;
end;
$$;

revoke all on function public.admin_create_community_notice(text, text, text, text)
  from public, anon;
revoke all on function public.admin_delete_community_notice(uuid)
  from public, anon;
grant execute on function public.admin_create_community_notice(text, text, text, text)
  to authenticated;
grant execute on function public.admin_delete_community_notice(uuid)
  to authenticated;

comment on function public.admin_create_community_notice(text, text, text, text) is
  'Creates an audited community NOTICE post for league-wide or team-specific display.';
comment on function public.admin_delete_community_notice(uuid) is
  'Permanently deletes an audited community NOTICE post.';

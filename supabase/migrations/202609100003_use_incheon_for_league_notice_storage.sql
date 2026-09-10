begin;

-- posts.team_id is still non-null for legacy mobile compatibility. League-wide
-- notices therefore use Incheon as a storage-only team; board = 'LEAGUE'
-- remains the source of truth for audience and the audit log hides this detail.
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
  normalized_board text := upper(trim(coalesce(target_board, ''));
  normalized_team_id text := trim(coalesce(target_team_id, ''));
  normalized_title text := trim(coalesce(notice_title, ''));
  normalized_content text := trim(coalesce(notice_content, ''));
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

  if normalized_board = 'TEAM' then
    resolved_team_id := normalized_team_id;

    if resolved_team_id = '' or not exists (
      select 1 from public.teams team where team.id = resolved_team_id
    ) then
      raise exception 'VALID_NOTICE_TEAM_REQUIRED';
    end if;
  else
    resolved_team_id := 'incheon';

    if not exists (
      select 1 from public.teams team where team.id = resolved_team_id
    ) then
      raise exception 'NOTICE_STORAGE_TEAM_REQUIRED';
    end if;
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
      'teamId', case when normalized_board = 'TEAM' then resolved_team_id else null end,
      'title', normalized_title
    ),
    '관리자 공지 등록'
  );

  return created_notice_id;
end;
$$;

revoke all on function public.admin_create_community_notice(text, text, text, text)
  from public, anon;
grant execute on function public.admin_create_community_notice(text, text, text, text)
  to authenticated;

comment on function public.admin_create_community_notice(text, text, text, text) is
  'Creates an audited notice; league notices use Incheon as their storage-only team.';

notify pgrst, 'reload schema';

commit;

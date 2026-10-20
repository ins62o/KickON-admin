begin;
create or replace function public.admin_update_community_notice(
  p_notice_id uuid,
  p_title text,
  p_content text,
  p_expected_title text,
  p_expected_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_title text := trim(coalesce(p_title, ''));
  normalized_content text := trim(coalesce(p_content, ''));
  before_notice public.posts%rowtype;
begin
  if current_actor is null or not public.admin_has_capability('moderation.write') then
    raise exception 'ADMIN_PERMISSION_REQUIRED';
  end if;
  if char_length(normalized_title) not between 2 and 100
    or char_length(normalized_content) not between 5 and 10000 then
    raise exception 'INVALID_NOTICE_CONTENT';
  end if;

  select * into before_notice from public.posts
  where id = p_notice_id and category = 'NOTICE'
  for update;
  if not found then
    raise exception 'NOTICE_NOT_FOUND';
  end if;
  if before_notice.title is distinct from p_expected_title
    or before_notice.content is distinct from p_expected_content then
    raise exception 'NOTICE_CONFLICT';
  end if;
  if before_notice.title = normalized_title and before_notice.content = normalized_content then
    return p_notice_id;
  end if;

  update public.posts set title = normalized_title, content = normalized_content
  where id = p_notice_id;
  perform public.data_center_write_audit(
    'COMMUNITY_NOTICE_UPDATED', 'post', p_notice_id::text,
    jsonb_build_object('title', before_notice.title, 'content', before_notice.content),
    jsonb_build_object('title', normalized_title, 'content', normalized_content),
    '관리자 공지 수정'
  );
  return p_notice_id;
end;
$$;
revoke all on function public.admin_update_community_notice(uuid, text, text, text, text) from public, anon;
grant execute on function public.admin_update_community_notice(uuid, text, text, text, text) to authenticated;
comment on function public.admin_update_community_notice(uuid, text, text, text, text) is
  'Edits only notice text with moderation.write authorization, conflict detection and an atomic audit record.';
notify pgrst, 'reload schema';
commit;

-- Keep post-view fan activity compatible with the smallint points contract.
-- PostgreSQL does not implicitly resolve an integer literal to smallint when
-- looking up this SECURITY DEFINER function by its argument types.

create or replace function public.capture_fan_activity_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_row public.posts;
  content_is_new boolean := true;
  target_user uuid;
  base_points smallint;
  valid_event boolean;
  invalid_reason text;
begin
  if tg_table_name = 'post_views' then
    perform public.record_fan_activity_event(
      new.user_id,
      'POST_READ'::text,
      new.post_id,
      new.post_id,
      new.user_id,
      1::smallint,
      true,
      true,
      null::text,
      new.created_at
    );
  elsif tg_table_name = 'posts' then
    content_is_new := public.claim_fan_activity_content(
      new.author_id, 'POST_CREATE', new.id, new.title || E'\n' || new.content,
      new.created_at
    );
    perform public.record_fan_activity_event(
      new.author_id, 'POST_CREATE', new.id, new.id, new.author_id,
      case when content_is_new then 3 else 0 end::smallint, true,
      new.moderation_status = 'VISIBLE',
      case when not content_is_new then 'DUPLICATE_CONTENT'
           when new.moderation_status <> 'VISIBLE' then 'MODERATION_HIDDEN' end,
      new.created_at
    );
  elsif tg_table_name = 'comments' then
    select * into post_row from public.posts where id = new.post_id;
    content_is_new := public.claim_fan_activity_content(
      new.user_id, 'COMMENT_CREATE', new.id, new.content, new.created_at
    );
    valid_event := new.moderation_status = 'VISIBLE'
      and post_row.moderation_status = 'VISIBLE';
    base_points := case
      when new.user_id = post_row.author_id or not content_is_new then 0 else 2
    end;
    invalid_reason := case
      when not content_is_new then 'DUPLICATE_CONTENT'
      when new.user_id = post_row.author_id then 'SELF_POST_COMMENT'
      when not valid_event then 'MODERATION_HIDDEN' end;
    perform public.record_fan_activity_event(
      new.user_id, 'COMMENT_CREATE', new.id, new.post_id, new.user_id,
      base_points, true, valid_event, invalid_reason, new.created_at
    );
  elsif tg_table_name = 'post_likes' then
    select * into post_row from public.posts where id = new.post_id;
    target_user := post_row.author_id;
    valid_event := post_row.moderation_status = 'VISIBLE';
    base_points := case when target_user = new.user_id then 0 else 1 end;
    perform public.record_fan_activity_event(
      target_user, 'POST_LIKE_RECEIVED', new.post_id, new.post_id, new.user_id,
      base_points, false, valid_event,
      case when target_user = new.user_id then 'SELF_LIKE'
           when not valid_event then 'MODERATION_HIDDEN' end,
      new.created_at
    );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_fan_activity_insert()
  from public, anon, authenticated;

comment on function public.capture_fan_activity_insert() is
  'Captures fan activity events with argument types matching record_fan_activity_event.';

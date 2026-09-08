-- Fix non-live likes while preserving suspension and reported-content guards.
create or replace function public.data_center_enforce_community_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Provider and trusted backend writes are unaffected.  Calls made by a
  -- signed-in mobile user, including SECURITY DEFINER cheer RPCs, retain the
  -- authenticated JWT role and are rejected while the suspension is active.
  if coalesce((select auth.role()), '') = 'authenticated'
    and not public.admin_has_capability('moderation.write')
    and (tg_op <> 'DELETE' or pg_trigger_depth() = 1)
    and not public.can_current_user_write_community() then
    raise exception 'COMMUNITY_SUSPENDED';
  end if;
  -- Resolve OLD.id only inside branches whose row type actually has an id.
  -- post_likes has a composite primary key, so a combined boolean expression
  -- still fails while PostgreSQL prepares the expression even on INSERT.
  if tg_op = 'DELETE'
    and coalesce((select auth.role()), '') = 'authenticated'
    and not public.admin_has_capability('moderation.write')
    and pg_trigger_depth() = 1 then
    if tg_table_name = 'posts' then
      if exists (
        select 1 from public.content_reports report
        where report.post_id = old.id and report.status in ('OPEN', 'REVIEWED')
      ) then
        raise exception 'REPORTED_CONTENT_DELETE_BLOCKED';
      end if;
    elsif tg_table_name = 'comments' then
      if exists (
        select 1 from public.content_reports report
        where report.comment_id = old.id and report.status in ('OPEN', 'REVIEWED')
      ) then
        raise exception 'REPORTED_CONTENT_DELETE_BLOCKED';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function public.data_center_enforce_community_suspension()
  from public, anon, authenticated;

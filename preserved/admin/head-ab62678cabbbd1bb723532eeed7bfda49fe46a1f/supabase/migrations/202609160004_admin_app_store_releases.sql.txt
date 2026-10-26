-- Also upgrade databases that already applied the original Android-only table.
alter table public.app_store_releases drop constraint app_store_releases_platform_check;
alter table public.app_store_releases add constraint app_store_releases_platform_check
  check (platform in ('ios', 'android'));

create policy "Administrators read app releases"
  on public.app_store_releases for select to authenticated
  using (public.admin_has_capability('system.read'));

create or replace function public.admin_set_app_store_release(
  target_platform text, release_version text, release_enabled boolean, change_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  old_value jsonb;
  new_value jsonb;
  actor_role public.admin_role;
begin
  if actor is null or not exists (
    select 1 from public.admin_users
    where user_id = actor and is_active and role::text in ('admin', 'super_admin')
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if target_platform not in ('ios', 'android') or target_platform is null
    or release_version is null or release_version !~ '^[0-9]+(\.[0-9]+){0,3}$'
    or release_enabled is null
    or change_reason is null or length(trim(change_reason)) not between 3 and 1000 then
    raise exception 'INVALID_RELEASE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('app-release:' || target_platform));
  select to_jsonb(r) into old_value from public.app_store_releases r where platform = target_platform;
  insert into public.app_store_releases (platform, version, enabled)
    values (target_platform, release_version, release_enabled)
    on conflict (platform) do update
      set version = excluded.version, enabled = excluded.enabled, updated_at = now();
  select to_jsonb(r) into new_value from public.app_store_releases r where platform = target_platform;
  select role into actor_role from public.admin_users where user_id = actor;
  insert into public.admin_audit_logs
    (actor_id, actor_role, action, entity_type, entity_id, reason, before_value, after_value)
    values (actor, actor_role, case when old_value is null then 'INSERT' else 'UPDATE' end,
      'app_store_releases', target_platform, trim(change_reason), old_value, new_value);
end;
$$;
revoke all on function public.admin_set_app_store_release(text, text, boolean, text) from public, anon;
grant execute on function public.admin_set_app_store_release(text, text, boolean, text) to authenticated;

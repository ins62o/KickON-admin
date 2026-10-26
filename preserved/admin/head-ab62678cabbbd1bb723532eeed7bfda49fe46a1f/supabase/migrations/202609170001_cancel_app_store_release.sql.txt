-- Cancel only the platform's latest saved change, without overwriting newer work.
create or replace function public.admin_cancel_app_store_release(
  target_platform text, target_audit_id bigint, change_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  latest public.admin_audit_logs;
  current_value jsonb;
  restored_version text;
  restored_enabled boolean;
  cancellation_id bigint;
begin
  if actor is null or not exists (
    select 1 from public.admin_users where user_id=actor and is_active and role::text in ('admin','super_admin')
  ) then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if target_platform is null or target_platform not in ('android','ios') or target_audit_id is null
    or change_reason is null or length(trim(change_reason)) not between 3 and 1000 then
    raise exception 'INVALID_RELEASE';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('app-release:' || target_platform));
  select * into latest from public.admin_audit_logs
    where entity_type='app_store_releases' and entity_id=target_platform order by id desc limit 1;
  select to_jsonb(r) into current_value from public.app_store_releases r where platform=target_platform;
  if latest.id is null or latest.id <> target_audit_id or latest.action='APP_RELEASE_CANCEL'
    or current_value is null or latest.after_value is distinct from current_value then
    raise exception 'RELEASE_CHANGED' using errcode='40001';
  end if;
  restored_version := coalesce(latest.before_value->>'version',current_value->>'version');
  restored_enabled := coalesce((latest.before_value->>'enabled')::boolean,false);
  perform public.admin_set_app_store_release(target_platform,restored_version,restored_enabled,trim(change_reason));
  select id into cancellation_id from public.admin_audit_logs
    where entity_type='app_store_releases' and entity_id=target_platform order by id desc limit 1;
  update public.admin_audit_logs set action='APP_RELEASE_CANCEL' where id=cancellation_id;
end;
$$;
revoke all on function public.admin_cancel_app_store_release(text,bigint,text) from public, anon;
grant execute on function public.admin_cancel_app_store_release(text,bigint,text) to authenticated;

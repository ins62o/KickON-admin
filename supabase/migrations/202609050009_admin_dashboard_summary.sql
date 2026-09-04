-- Keep the main dashboard aggregate intentionally small. The full dashboard
-- RPC remains available to older console pages, while this endpoint reads only
-- the two values rendered by the simplified home dashboard.

create or replace function public.admin_get_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_sync_available boolean := to_regclass('public.sync_runs') is not null;
  v_failed_sync_count bigint := null;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('dashboard.read')
    )
  then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;

  if v_sync_available then
    execute '
      select count(*)::bigint
      from public.sync_runs run
      where run.created_at >= $1
        and run.status in (''failed'', ''partial'')
        and (
          run.status = ''failed''
          or coalesce(run.failed_count, 0) > 0
          or nullif(run.error_code, '''') is not null
          or nullif(run.error_message, '''') is not null
        )
    '
    into v_failed_sync_count
    using v_now - interval '24 hours';
  end if;

  return jsonb_build_object(
    'generatedAt', v_now,
    'totalProfiles', (select count(*) from public.profiles),
    'syncAvailable', v_sync_available,
    'failedSyncCount', v_failed_sync_count
  );
end;
$$;

revoke all on function public.admin_get_dashboard_summary()
  from public, anon;
grant execute on function public.admin_get_dashboard_summary()
  to authenticated, service_role;

comment on function public.admin_get_dashboard_summary() is
  'Returns the profile total and the last-24-hour sync failure count for dashboard readers.';

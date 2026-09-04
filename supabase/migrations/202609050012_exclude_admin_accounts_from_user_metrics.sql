-- Exclude console administrators and email-only accounts from the app-member
-- total. KICKON app members authenticate with Apple or Kakao; email accounts
-- are reserved for console administration.

begin;

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
    'totalProfiles', (
      select count(*)
      from public.profiles profile
      where not exists (
        select 1
        from public.admin_users administrator
        where administrator.user_id = profile.id
      )
      and not exists (
        select 1
        from auth.identities identity
        where identity.user_id = profile.id
          and lower(identity.provider) = 'email'
      )
    ),
    'excludesServiceAccounts', true,
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
  'Returns the app-member total excluding admin and email accounts, plus the last-24-hour sync failure count.';

commit;

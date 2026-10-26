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
      from public.sync_runs failed_run
      where failed_run.created_at >= $1
        and failed_run.status in (''failed'', ''partial'')
        and (
          failed_run.status = ''failed''
          or coalesce(failed_run.failed_count, 0) > 0
          or nullif(failed_run.error_code, '''') is not null
          or nullif(failed_run.error_message, '''') is not null
        )
        and not exists (
          select 1
          from public.sync_runs recovered_run
          where recovered_run.created_at > failed_run.created_at
            and recovered_run.status = ''succeeded''
            and recovered_run.job_key = failed_run.job_key
            and coalesce(recovered_run.metadata ->> ''operationKey'', '''')
              = coalesce(failed_run.metadata ->> ''operationKey'', '''')
            and coalesce(recovered_run.metadata ->> ''leagueId'', ''all'')
              = coalesce(failed_run.metadata ->> ''leagueId'', ''all'')
            and coalesce(recovered_run.metadata ->> ''season'', '''')
              = coalesce(failed_run.metadata ->> ''season'', '''')
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
      where profile.registration_completed_at is not null
        and not exists (
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
  'Returns completed app-member totals plus unresolved sync failures from the last 24 hours; a later successful run in the same scope clears an earlier failure.';

commit;

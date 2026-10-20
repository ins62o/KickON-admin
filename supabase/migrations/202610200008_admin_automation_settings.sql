begin;

-- Retire only the disabled retention schedule; keep all cheer messages and cleanup functions.
do $$
declare job record;
begin
  for job in select jobid,active from cron.job where jobname='kickon-fixture-cheer-retention' loop
    if job.active then raise exception 'CHEER_RETENTION_MUST_BE_DISABLED'; end if;
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

create or replace function public.get_admin_push_settings()
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
  if coalesce((select auth.role()),'') <> 'service_role'
    and not public.is_admin('viewer'::public.admin_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  select jsonb_build_object(
    'checked_at',now(),
    'global_disabled',config.mode='OFF',
    'max_attempts',config.max_attempts,
    'base_retry_delay_seconds',config.base_retry_delay_seconds,
    'max_retry_delay_seconds',config.max_retry_delay_seconds,
    'notifications',(select jsonb_agg(jsonb_build_object(
      'type',kind.type,
      'domain',public.push_notification_domain(kind.type),
      'mode',public.effective_push_mode(public.push_notification_domain(kind.type))
    ) order by kind.position) from (values
      ('MATCH',1),('LINEUP',2),('COMMUNITY',3),('ATTENDANCE',4),('SYSTEM',5)
    ) kind(type,position))
  ) into result from public.push_runtime_config config where config.singleton;
  if result is null then raise exception 'PUSH_RUNTIME_CONFIG_MISSING'; end if;
  return result;
end;
$$;
revoke all on function public.get_admin_push_settings() from public,anon,authenticated;
grant execute on function public.get_admin_push_settings() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

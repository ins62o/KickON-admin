-- KickOn Data Center: restricted manual execution for retention cron jobs.
-- Apply after 202608300004. This does not replace the existing pg_cron jobs.

create or replace function public.run_admin_retention_cleanup(
  p_job_key text,
  p_reason text
)
returns table (
  deleted_count bigint,
  cutoff_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  current_role public.admin_role;
  affected_rows bigint := 0;
  target_cutoff timestamptz;
  target_entity text;
begin
  if current_actor is null or not public.is_admin('admin') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 or char_length(p_reason) > 500 then
    raise exception 'INVALID_CLEANUP_REASON';
  end if;

  select administrator.role into current_role
  from public.admin_users administrator
  where administrator.user_id = current_actor and administrator.is_active;

  case p_job_key
    when 'kickon-football-provider-usage-retention' then
      target_cutoff := now() - interval '60 days';
      target_entity := 'football_provider_usage';
      delete from public.football_provider_usage usage
      where usage.observed_at < target_cutoff;
      get diagnostics affected_rows = row_count;
    when 'kickon-fixture-cheer-retention' then
      target_cutoff := now() - interval '48 hours';
      target_entity := 'fixture_cheer_messages';
      delete from public.fixture_cheer_messages message
      where message.created_at < target_cutoff;
      get diagnostics affected_rows = row_count;
    else
      raise exception 'UNSUPPORTED_RETENTION_JOB';
  end case;

  insert into public.admin_audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    before_value, after_value
  ) values (
    current_actor, current_role, 'RETENTION_CLEANUP', target_entity, p_job_key,
    trim(p_reason),
    jsonb_build_object('cutoffAt', target_cutoff),
    jsonb_build_object('deletedCount', affected_rows)
  );

  return query select affected_rows, target_cutoff;
end;
$$;

revoke all on function public.run_admin_retention_cleanup(text, text)
  from public, anon;
grant execute on function public.run_admin_retention_cleanup(text, text)
  to authenticated;

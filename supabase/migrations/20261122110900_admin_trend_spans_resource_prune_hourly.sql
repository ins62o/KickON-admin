-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 11:09 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why:
-- 1. admin_get_active_user_trend() joined each of the 180 charted days to every member-day in its
--    30-day window (about 137K joined rows) and sorted them for count(distinct), spilling to disk.
--    About 340ms per dashboard load.
-- 2. admin_schedule_resource_collection() runs every minute and pruned its own cron history with a
--    full scan of cron.job_run_details (about 314K rows, only the runid primary key, owned by
--    supabase_admin so no index can be added). About 180ms per run, every minute.
-- Change:
-- 1. Merge each member's overlapping 30-day windows into spans and count active members with a running
--    sum of span starts and ends. Admin check, exclusions (admins, email identities), window and jsonb
--    output are unchanged.
-- 2. Collect every minute as before, but prune only at minute 0 (UTC). Same rows, same 8-day cutoff;
--    history can be kept up to one hour longer.
--
-- Verification on production: the new trend and the previous definition (as a pg_temp copy) returned
-- the same jsonb in one statement (180 days, MAU sum 58540). Best of three: 341ms before, 34ms after.
-- The first collection after the swap succeeded in 11ms (before: 178-231ms) and its HTTP calls kept
-- returning 200/202. No cron history was deleted by this change.
--
-- Definitions before: trend md5 b94d8cbf9d7cb4b342e0b4ff0ba6e36e, resource md5 a90e40486e4fe87567ce92e6921974e8.
-- Definitions after:  trend md5 090d938c94c0b876dbcb6495fffd7163, resource md5 55fcb1da754b38930f89d16002c3bde5.
-- Rollback: re-create the previous definitions shown in the comment at the end.

CREATE OR REPLACE FUNCTION public.admin_get_active_user_trend()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('dashboard.read')
    )
  then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;

  return (
    with member_days as (
      -- 180 charted days plus the 29 earlier days the first rolling MAU needs.
      select activity.activity_date, activity.user_id
      from public.app_daily_activity activity
      where activity.activity_date > v_today - 209
        and not exists (
          select 1
          from public.admin_users administrator
          where administrator.user_id = activity.user_id
        )
        and not exists (
          select 1
          from auth.identities identity
          where identity.user_id = activity.user_id
            and lower(identity.provider) = 'email'
        )
    ),
    user_days as (
      select distinct member_day.user_id, member_day.activity_date
      from member_days member_day
    ),
    -- Each active day counts its member for 30 days; overlapping windows merge into one span per member.
    span_starts as (
      select user_day.user_id, user_day.activity_date,
        case when lag(user_day.activity_date) over member_order >= user_day.activity_date - 30 then 0 else 1 end as starts_span
      from user_days user_day
      window member_order as (partition by user_day.user_id order by user_day.activity_date)
    ),
    span_members as (
      select span_start.user_id, span_start.activity_date,
        sum(span_start.starts_span) over (partition by span_start.user_id order by span_start.activity_date) as span_number
      from span_starts span_start
    ),
    spans as (
      select min(span_member.activity_date) as covered_from, max(span_member.activity_date) + 29 as covered_to
      from span_members span_member
      group by span_member.user_id, span_member.span_number
    ),
    series as (
      select generated.day_at::date as day
      from generate_series(v_today - 179, v_today, interval '1 day') as generated(day_at)
    ),
    changes as (
      select span.covered_from as day, 1 as delta from spans span
      union all
      select span.covered_to + 1, -1 from spans span
      union all
      select series.day, 0 from series
    ),
    running as (
      select change_day.day, sum(change_day.delta) over (order by change_day.day) as active
      from (select change.day, sum(change.delta) as delta from changes change group by change.day) change_day
    ),
    day_counts as (
      select user_day.activity_date as day, count(*) as dau
      from user_days user_day
      group by user_day.activity_date
    ),
    daily as (
      select series.day, coalesce(day_count.dau, 0) as dau, running.active::bigint as mau
      from series
      join running on running.day = series.day
      left join day_counts day_count on day_count.day = series.day
    )
    select jsonb_build_object(
      'generatedAt', v_now,
      'today', v_today,
      'trackingStartedOn', (select min(activity.activity_date) from public.app_daily_activity activity),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', daily.day,
          'dau', daily.dau,
          'mau', daily.mau
        ) order by daily.day)
        from daily
      ), '[]'::jsonb)
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_schedule_resource_collection()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project_url text; token text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='kickon_monitoring_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='kickon_monitoring_cron_secret';
 if project_url is null or token is null then raise exception 'Monitoring is not configured'; end if;
 -- Pruning scans all of cron.job_run_details (no usable index), so run it on the hour instead of every minute.
 if extract(minute from now() at time zone 'UTC') = 0 then
  delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname='kickon-admin-resource-monitoring') and end_time < now()-interval '8 days';
 end if;
 return net.http_post(url:=project_url||'/functions/v1/collect-admin-resources',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=30000);
end $function$;

-- Previous definitions (before 2026-11-22):
--
-- CREATE OR REPLACE FUNCTION public.admin_get_active_user_trend()
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- declare
--   v_now timestamptz := now();
--   v_today date := (v_now at time zone 'Asia/Seoul')::date;
-- begin
--   if coalesce((select auth.role()), '') <> 'service_role'
--     and (
--       (select auth.uid()) is null
--       or not public.admin_has_capability('dashboard.read')
--     )
--   then
--     raise exception 'DASHBOARD_PERMISSION_REQUIRED';
--   end if;
--
--   return (
--     with member_days as (
--       -- 180 charted days plus the 29 earlier days the first rolling MAU needs.
--       select activity.activity_date, activity.user_id
--       from public.app_daily_activity activity
--       where activity.activity_date > v_today - 209
--         and not exists (
--           select 1
--           from public.admin_users administrator
--           where administrator.user_id = activity.user_id
--         )
--         and not exists (
--           select 1
--           from auth.identities identity
--           where identity.user_id = activity.user_id
--             and lower(identity.provider) = 'email'
--         )
--     ),
--     daily as (
--       select
--         series.day,
--         count(distinct member_day.user_id) filter (where member_day.activity_date = series.day) as dau,
--         count(distinct member_day.user_id) as mau
--       from (
--         select generated.day_at::date as day
--         from generate_series(v_today - 179, v_today, interval '1 day') as generated(day_at)
--       ) series
--       left join member_days member_day
--         on member_day.activity_date > series.day - 30
--         and member_day.activity_date <= series.day
--       group by series.day
--     )
--     select jsonb_build_object(
--       'generatedAt', v_now,
--       'today', v_today,
--       'trackingStartedOn', (select min(activity.activity_date) from public.app_daily_activity activity),
--       'daily', coalesce((
--         select jsonb_agg(jsonb_build_object(
--           'date', daily.day,
--           'dau', daily.dau,
--           'mau', daily.mau
--         ) order by daily.day)
--         from daily
--       ), '[]'::jsonb)
--     )
--   );
-- end;
-- $function$
--
-- CREATE OR REPLACE FUNCTION public.admin_schedule_resource_collection()
--  RETURNS bigint
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- declare project_url text; token text;
-- begin
--  select decrypted_secret into project_url from vault.decrypted_secrets where name='kickon_monitoring_project_url';
--  select decrypted_secret into token from vault.decrypted_secrets where name='kickon_monitoring_cron_secret';
--  if project_url is null or token is null then raise exception 'Monitoring is not configured'; end if;
--  delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname='kickon-admin-resource-monitoring') and end_time < now()-interval '8 days';
--  return net.http_post(url:=project_url||'/functions/v1/collect-admin-resources',
--   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=30000);
-- end $function$

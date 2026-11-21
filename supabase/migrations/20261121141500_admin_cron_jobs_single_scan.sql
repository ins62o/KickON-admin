-- Record of a forward change already applied to production (KickON) on 2026-11-21 around 23:15 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: get_admin_cron_jobs() ran two lateral subqueries per KickON job against cron.job_run_details
-- (about 312K rows, only the runid primary key, owned by supabase_admin so no index can be added),
-- i.e. 24 full scans per call (about 1.5s). get_admin_football_sync_health() calls it as well, so the
-- sync screen paid for it twice.
-- Change: read the latest run per job with one DISTINCT ON scan and the 24-hour failure counts with
-- one grouped scan. Signature, admin check, ordering and output are unchanged.
--
-- Verification on production: the new function and the previous lateral logic returned identical rows
-- in one statement (md5 of rows ddec0eba... before, 261d2db8... after the swap, each compared
-- old = new). Call time fell from about 1.5s to 0.66-0.80s and the sync screen from 2.7-3.9s to 1.4-1.5s.
-- No cron history was deleted; growth of cron.job_run_details (about 7K rows/day) is still open.
--
-- Definition before: md5 a50ac94f32cc8d8d9deaafaa40749a7f. Definition after: md5 d4454022026a0a59d396c8ad60c02964.
-- Rollback: re-create the previous definition (the lateral version shown in the comment at the end).

CREATE OR REPLACE FUNCTION public.get_admin_cron_jobs()
 RETURNS TABLE(job_id bigint, job_name text, schedule text, active boolean, last_status text, last_started_at timestamp with time zone, last_finished_at timestamp with time zone, last_message text, failure_count_24h bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  -- Scan cron.job_run_details once for all KickON jobs instead of twice per job.
  return query
  select
    job.jobid,
    job.jobname,
    job.schedule,
    job.active,
    recent.status,
    recent.start_time,
    recent.end_time,
    recent.return_message,
    coalesce(statistics.failure_count_24h, 0)
  from cron.job job
  left join (
    select distinct on (detail.jobid)
      detail.jobid, detail.status, detail.start_time, detail.end_time, detail.return_message
    from cron.job_run_details detail
    where detail.jobid in (select kickon.jobid from cron.job kickon where kickon.jobname like 'kickon-%')
    order by detail.jobid, detail.start_time desc
  ) recent on recent.jobid = job.jobid
  left join (
    select detail.jobid, count(*) as failure_count_24h
    from cron.job_run_details detail
    where detail.start_time >= now() - interval '24 hours'
      and detail.status not in ('succeeded', 'running')
    group by detail.jobid
  ) statistics on statistics.jobid = job.jobid
  where job.jobname like 'kickon-%'
  order by job.jobname;
end;
$function$;

-- Previous definition (rollback):
-- CREATE OR REPLACE FUNCTION public.get_admin_cron_jobs()
--  RETURNS TABLE(job_id bigint, job_name text, schedule text, active boolean, last_status text, last_started_at timestamp with time zone, last_finished_at timestamp with time zone, last_message text, failure_count_24h bigint)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO ''
-- AS $function$
-- begin
--   if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
--     raise exception 'ADMIN_REQUIRED';
--   end if;
-- 
--   return query
--   select
--     job.jobid,
--     job.jobname,
--     job.schedule,
--     job.active,
--     recent.status,
--     recent.start_time,
--     recent.end_time,
--     recent.return_message,
--     coalesce(statistics.failure_count_24h, 0)
--   from cron.job job
--   left join lateral (
--     select detail.status, detail.start_time, detail.end_time, detail.return_message
--     from cron.job_run_details detail
--     where detail.jobid = job.jobid
--     order by detail.start_time desc
--     limit 1
--   ) recent on true
--   left join lateral (
--     select count(*) as failure_count_24h
--     from cron.job_run_details detail
--     where detail.jobid = job.jobid
--       and detail.start_time >= now() - interval '24 hours'
--       and detail.status not in ('succeeded', 'running')
--   ) statistics on true
--   where job.jobname like 'kickon-%'
--   order by job.jobname;
-- end;
-- $function$

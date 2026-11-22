-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 11:25 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: cron.job_run_details had no retention (about 315K rows since 2026-08-29, +6.9K rows/day). It is
-- owned by supabase_admin, so no index can be added, and get_admin_cron_jobs(),
-- get_admin_football_sync_health() and get_admin_sync_execution_history() scan it on every call.
-- Change: a daily pg_cron job keeps successful runs for 14 days and every other run (failed etc.) for
-- 90 days. Admin screens read at most 7 days of history plus the latest run and 24-hour failures.
-- The first cleanup ran right after scheduling with the same predicate and deleted 226,404 rows, all
-- 'succeeded' and older than 14 days. All 191 non-succeeded rows were kept.
--
-- Verification on production: 88,456 rows remained (oldest success 2026-11-08). Best of three calls:
-- get_admin_cron_jobs 538ms -> 178ms, get_admin_football_sync_health 619ms -> 250ms,
-- get_admin_sync_execution_history(null, 1) 216ms -> 145ms. The heap stays 61MB until vacuum reuses
-- the space. The scheduled job is jobid 18, '30 18 * * *' (03:30 KST), active.
--
-- Rollback: select cron.unschedule('kickon-cron-history-retention'); deleted history cannot be restored.

select cron.schedule(
  'kickon-cron-history-retention',
  '30 18 * * *',
  $$delete from cron.job_run_details
    where (status = 'succeeded' and start_time < now() - interval '14 days')
       or start_time < now() - interval '90 days'$$
);

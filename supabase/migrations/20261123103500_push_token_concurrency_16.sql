-- Record of a forward change already applied to production (KickON) on 2026-11-23 10:35 KST through the SQL
-- Editor. This file is a record, not an approval to run it (see README.md). App-owned push configuration.
-- Replaying it is refused by its own guard (CONFIG_DRIFT).
--
-- Why: on match days pushes complete late (39 fan-outs of 150+ sends on 11-21/22: median p50 15.7 s, p95 29.5 s,
-- 9.6 sends per second). Per device the deployed dispatcher makes 5 sequential RPCs (renew, reserve, authorize,
-- authorize before dispatch, record); reserve and record share one serialized chain per worker. Calls take
-- 100-120 ms at the gateway on a match day, and batches carry only 2-3 items with a concurrency of 8.
-- Change: push_runtime_config.token_concurrency 8 -> 16 (allowed range 1-20), nothing else.
--
-- Verification before: the deployed function source reads token_concurrency and no PUSH_FAIR_*_CONCURRENCY secret
-- is listed. An offline model of the App dispatch code (assumed delays, no network, local code not identical to the
-- deployed bundle) took 37-42% less time per 30-send window at 16 than at 8, and 20 was no better than 16.
-- Verification after: token_concurrency 16, every other value unchanged, no open work or worker lease. No push has been
-- sent with the new value yet; the first matches are 2026-11-28 14:00 KST.
-- Baseline for comparison: push_outbox COMPLETED 45518, DEAD_LETTER 76, SHADOWED 320, SUPPRESSED 3296,
-- UNKNOWN_OUTCOME 14; host memory reached 88% during the 11-21 16:31 fan-out.
-- Roll back when memory passes 95%, failed or unknown outcomes grow, or the rate drops.
--
-- Observation query (read-only):
-- -- Read-only: per fan-out of 150+ sends, created -> completed. Run after a match day and compare with 11-21/11-22.
-- select to_char(date_trunc('minute', o.created_at) at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as fanout, count(*) as sends,
--   round(percentile_cont(0.5) within group (order by extract(epoch from o.completed_at - o.created_at))::numeric, 1) as p50_s,
--   round(percentile_cont(0.95) within group (order by extract(epoch from o.completed_at - o.created_at))::numeric, 1) as p95_s,
--   round((count(*) / nullif(extract(epoch from max(o.completed_at) - min(o.created_at)), 0))::numeric, 1) as sends_per_s
-- from public.push_outbox o
-- where o.status = 'COMPLETED' and o.completed_at is not null and o.created_at >= '2026-11-21 00:00+09'
-- group by date_trunc('minute', o.created_at) having count(*) >= 150 order by date_trunc('minute', o.created_at);
--
-- Rollback (not part of the change):
-- -- Return push token_concurrency 16 -> 8 (safe at any time; running windows keep the value they claimed with).
-- do $fix$
-- declare v_count integer;
-- begin
--   update public.push_runtime_config set token_concurrency = 8, updated_at = now() where singleton and token_concurrency = 16;
--   get diagnostics v_count = row_count;
--   if v_count <> 1 then raise exception 'ROW_COUNT %', v_count; end if;
-- end
-- $fix$;

do $fix$
declare
  v_count integer;
begin
  perform 1 from public.push_runtime_config where singleton for update;
  select count(*) into v_count from public.push_runtime_config
  where singleton and mode = 'SHADOW' and token_concurrency = 8 and max_concurrent_workers = 4 and dispatcher_batch_size = 100
    and lease_seconds = 60 and max_targets_per_outbox = 20 and max_attempts = 5 and updated_at = '2026-09-25T11:18:14.205596+00:00';
  if v_count <> 1 then raise exception 'CONFIG_DRIFT'; end if;
  if exists (select 1 from public.push_dispatch_worker_leases where lease_expires_at > now())
    or exists (select 1 from public.push_outbox where status = 'PROCESSING') then raise exception 'PUSH_DISPATCH_ACTIVE'; end if;
  if exists (select 1 from public.fixtures where status = 'LIVE'
    or (status = 'SCHEDULED' and kickoff_at between now() - interval '3 hours' and now() + interval '2 hours')) then
    raise exception 'MATCH_WINDOW'; end if;
  update public.push_runtime_config set token_concurrency = 16, updated_at = now() where singleton and token_concurrency = 8;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'ROW_COUNT %', v_count; end if;
  select count(*) into v_count from public.push_runtime_config
  where singleton and token_concurrency = 16 and mode = 'SHADOW' and max_concurrent_workers = 4 and dispatcher_batch_size = 100;
  if v_count <> 1 then raise exception 'FINAL_CHECK'; end if;
end
$fix$;

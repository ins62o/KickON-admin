-- Record of a forward change already applied to production (KickON) on 2026-11-23 around 16:06 KST through the
-- SQL Editor. This file is a record, not an approval to run it (see README.md).
-- Replaying it is refused by its own guards (GUARD_FUNCTION_EXISTS, GUARD_JOB_EXISTS).
--
-- Why: push and notification history had no retention. The four delivery tables and notifications held 165 MB of a
-- 496 MB database (2026-09-10 onward) and grow by about 14k rows per table on each matchday weekend.
-- Change:
--   1. new public.prune_push_history(p_limit): deletes at most p_limit rows per table per call
--      - push_outbox COMPLETED/SUPPRESSED/SHADOWED/DISMISSED after 60 days, DEAD_LETTER/UNKNOWN_OUTCOME after 180 days;
--        PENDING/PROCESSING/RETRY are never touched; targets, attempts and dispatch schedules cascade
--      - notifications after 90 days, only when no push_outbox row still references them (no SET NULL updates)
--      - execute for postgres only (revoked from public, anon, authenticated, service_role)
--   2. cron job 20 kickon-push-history-retention, 40 18 * * * (03:40 KST), select public.prune_push_history(5000);
-- Notes: notifications.dedupe_key is the only guard against repeating a fixture phase notification. No MATCH notification
-- was ever created more than 3.5 hours after kickoff, and users can already delete their own notifications.
--
-- Verification before (always rolled back): with the real intervals the function deleted 0 rows; a temporary copy with
-- 50/50/60 days deleted outbox 521/521, targets 557/557, attempts 557/557, schedules 521/521, notifications 1,151/1,151
-- as precomputed, left in-flight rows unchanged and nothing eligible behind, a second call deleted 0, in 0.9 s.
-- Verification during the change: privileges, job definition and a first call returning 0/0 were checked before commit.
-- After: anon, authenticated and service_role cannot execute; acl {postgres=X/postgres}; security definer with
-- search_path ""; push_outbox 49,224 and notifications 49,438 unchanged. Function md5 774e844e....
-- First deletions are expected from 2026-11-25 03:40 KST. The admin push screens then show the last 60 days.
--
-- Rollback (not part of the change; deleted rows cannot be restored):
--   select cron.unschedule('kickon-push-history-retention'); drop function public.prune_push_history(integer);

begin;
do $guard$
begin
  if exists (select 1 from pg_proc where proname = 'prune_push_history' and pronamespace = 'public'::regnamespace) then
    raise exception 'GUARD_FUNCTION_EXISTS';
  end if;
  if exists (select 1 from cron.job where jobname = 'kickon-push-history-retention') then
    raise exception 'GUARD_JOB_EXISTS';
  end if;
end $guard$;
create function public.prune_push_history(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_outbox integer;
  v_notifications integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20000 then
    raise exception 'INVALID_PRUNE_LIMIT';
  end if;
  -- Delivery details: settled sends after 60 days, failed or unknown outcomes after 180 days.
  -- Work in flight (PENDING, PROCESSING, RETRY) is never touched. Targets, attempts and schedules cascade.
  with doomed as (
    select o.id
    from public.push_outbox o
    where (o.status in ('COMPLETED','SUPPRESSED','SHADOWED','DISMISSED') and o.created_at < now() - interval '60 days')
       or (o.status in ('DEAD_LETTER','UNKNOWN_OUTCOME') and o.created_at < now() - interval '180 days')
    order by o.created_at, o.id
    limit p_limit
    for update skip locked
  )
  delete from public.push_outbox o using doomed d where o.id = d.id;
  get diagnostics v_outbox = row_count;
  -- Inbox rows after 90 days, only once no delivery row still points at them.
  with doomed as (
    select n.id
    from public.notifications n
    where n.created_at < now() - interval '90 days'
      and not exists (select 1 from public.push_outbox o where o.notification_id = n.id)
    order by n.created_at, n.id
    limit p_limit
    for update of n skip locked
  )
  delete from public.notifications n using doomed d where n.id = d.id;
  get diagnostics v_notifications = row_count;
  return jsonb_build_object('push_outbox', v_outbox, 'notifications', v_notifications);
end;
$function$;
revoke all on function public.prune_push_history(integer) from public, anon, authenticated, service_role;
select cron.schedule('kickon-push-history-retention', '40 18 * * *', 'select public.prune_push_history(5000);');
do $verify$
declare
  v_first jsonb;
begin
  if has_function_privilege('anon', 'public.prune_push_history(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.prune_push_history(integer)', 'execute')
     or has_function_privilege('service_role', 'public.prune_push_history(integer)', 'execute') then
    raise exception 'VERIFY_PRIVILEGE';
  end if;
  if (select count(*) from cron.job where jobname = 'kickon-push-history-retention' and schedule = '40 18 * * *'
      and active and command = 'select public.prune_push_history(5000);' and username = 'postgres') <> 1 then
    raise exception 'VERIFY_JOB';
  end if;
  -- Nothing is old enough yet on the day of application; a different count means the data moved since review.
  v_first := public.prune_push_history(5000);
  if v_first <> '{"push_outbox": 0, "notifications": 0}'::jsonb then
    raise exception 'VERIFY_FIRST_RUN %', v_first;
  end if;
end $verify$;
commit;
select jobid, jobname, schedule, active, command, md5(p.prosrc) fn_md5,
  has_function_privilege('anon', 'public.prune_push_history(integer)', 'execute') anon_exec
from cron.job, pg_proc p
where jobname = 'kickon-push-history-retention' and p.oid = 'public.prune_push_history(integer)'::regprocedure;

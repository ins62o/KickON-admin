-- Record of a forward change already applied to production (KickON) on 2026-11-21 around 21:40 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: get_admin_push_overview() classified the whole push_outbox history through
-- admin_push_delivery_outcomes() before filtering to today, took 3.7-5.1s and hit its 5s
-- statement_timeout, so the admin push page returned HTTP 500.
-- Change: classify only today's candidate rows plus open rows, with the same outcome and
-- outcome_at rules as admin_push_delivery_records()/admin_push_delivery_outcomes().
-- The shared functions, the 5s timeout and the admin check are unchanged.
--
-- Production state before: get_admin_push_overview md5 8053088f82a06a7dd5dea6bfc2fe1e55.
-- Rollback: re-create that previous definition (only its scoped CTE differs), then optionally
-- drop admin_push_overview_outcomes and the six *_v1_idx indexes.
--
-- Production applied each index with CREATE INDEX CONCURRENTLY as a separate statement.
-- Plain CREATE INDEX is kept here so the file can replay inside a transaction.
-- Development has the six indexes only. Its push admin functions read the
-- kickon_push_event_admin_v1 views, so this function swap was not applied there and must be
-- rewritten when the App push ledger work reaches production.

CREATE INDEX IF NOT EXISTS push_outbox_created_at_v1_idx
  ON public.push_outbox (created_at);
CREATE INDEX IF NOT EXISTS push_outbox_completed_at_v1_idx
  ON public.push_outbox (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_outbox_dead_lettered_at_v1_idx
  ON public.push_outbox (dead_lettered_at) WHERE dead_lettered_at IS NOT NULL;
-- A row classified as pending can never be in one of these six terminal states.
CREATE INDEX IF NOT EXISTS push_outbox_open_status_v1_idx
  ON public.push_outbox (id)
  WHERE status NOT IN ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER','UNKNOWN_OUTCOME');
CREATE INDEX IF NOT EXISTS push_delivery_targets_completed_at_v1_idx
  ON public.push_delivery_targets (completed_at, outbox_id) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_delivery_attempts_success_completed_v1_idx
  ON public.push_delivery_attempts (completed_at, outbox_id) WHERE status = 'SUCCEEDED';

-- Candidates are complete: a non-pending outcome_at is
-- coalesce(outbox completed_at, dead_lettered_at, max target completed_at, today's success, created_at),
-- so an outcome_at inside the window comes from a column covered by one of the candidate branches.
create or replace function public.admin_push_overview_outcomes(p_starts_at timestamptz, p_ends_at timestamptz)
returns table(outcome text, outcome_at timestamptz)
language sql
stable security definer
set search_path to ''
as $function$
 with candidates as (
  select o.id from public.push_outbox o
   where o.status not in ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER','UNKNOWN_OUTCOME')
  union select o.id from public.push_outbox o where o.created_at >= p_starts_at and o.created_at < p_ends_at
  union select o.id from public.push_outbox o where o.completed_at >= p_starts_at and o.completed_at < p_ends_at
  union select o.id from public.push_outbox o where o.dead_lettered_at >= p_starts_at and o.dead_lettered_at < p_ends_at
  union select d.outbox_id from public.push_delivery_targets d where d.completed_at >= p_starts_at and d.completed_at < p_ends_at
  union select a.outbox_id from public.push_delivery_attempts a
   where a.status = 'SUCCEEDED' and a.completed_at >= p_starts_at and a.completed_at < p_ends_at
 ), context as (
  select o.id,o.status,o.created_at,o.completed_at,o.dead_lettered_at,o.targets_materialized_at,o.last_error_code,
   case when n.type='MATCH' and n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then m.goal_enabled
    when n.type in ('MATCH','ATTENDANCE') then m.match_enabled when n.type='LINEUP' then m.lineup_enabled
    when n.type='COMMUNITY' then m.community_enabled when n.type='SYSTEM' then m.enabled
    when n.id is null then case split_part(o.effect_key,':',1)
     when 'fixture-live' then m.match_enabled when 'fixture-halftime' then m.match_enabled when 'fixture-second-half' then m.match_enabled when 'fixture-finished' then m.match_enabled
     when 'fixture-goal' then m.goal_enabled when 'fixture-goal-cancelled' then m.goal_enabled when 'fixture-lineup' then m.lineup_enabled
     when 'comment' then m.community_enabled when 'comment-reply' then m.community_enabled when 'post-like' then m.community_enabled when 'attendance-reminder' then m.match_enabled end end as current_preference
  from candidates c
  join public.push_outbox o on o.id = c.id
  join public.admin_push_members() m on m.user_id = o.user_id
  left join public.notifications n on n.id = o.notification_id and n.user_id = o.user_id
 ), evidence as (
  select r.id,r.status,r.created_at,r.completed_at,r.dead_lettered_at,r.targets_materialized_at,
   case when a.attempts=0 then r.last_error_code else a.last_error_code end as last_error_code,
   a.last_attempted_at,t.targets,t.succeeded,t.failed,t.pending,t.unknown,t.shadowed,t.suppressed,t.expired,
   t.latest_completed_at,greatest(t.success_at,a.success_at) as success_at
  from context r
  cross join lateral(
   select count(*) as targets,count(*) filter(where d.status='SUCCEEDED') as succeeded,
    count(*) filter(where d.status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
    count(*) filter(where d.status in ('PENDING','PROCESSING','RETRY')) as pending,
    count(*) filter(where d.status='UNKNOWN_OUTCOME') as unknown,
    count(*) filter(where d.status='SHADOWED') as shadowed,count(*) filter(where d.status='SUPPRESSED') as suppressed,
    count(*) filter(where d.status='SUPPRESSED' and d.last_error_code='PUSH_EXPIRED') as expired,
    max(d.completed_at) as latest_completed_at,
    max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=p_starts_at and d.completed_at<p_ends_at) as success_at
   from public.push_delivery_targets d where d.outbox_id=r.id) t
  cross join lateral(
   select count(*) as attempts,max(d.attempted_at) as last_attempted_at,
    (array_agg(d.error_code order by d.attempted_at desc,d.id desc))[1] as last_error_code,
    max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=p_starts_at and d.completed_at<p_ends_at) as success_at
   from public.push_delivery_attempts d where d.outbox_id=r.id) a
  where r.current_preference is true
 )
 select case
   when e.unknown>0 or e.status='UNKNOWN_OUTCOME' then 'unknown'
   when e.status in ('PENDING','PROCESSING','RETRY') then 'pending'
   when e.pending>0 and e.status not in ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER') then 'pending'
   when e.succeeded>0 and (e.succeeded<e.targets or e.status='DEAD_LETTER') then 'partial'
   when e.succeeded>0 then 'success'
   when e.status='DEAD_LETTER' then 'failure'
   when e.status not in ('SUPPRESSED','DISMISSED','SHADOWED') and e.failed>0 then 'failure'
   when e.expired>0 or e.last_error_code='PUSH_EXPIRED' and e.status='SUPPRESSED' then 'expired'
   when e.status in ('SUPPRESSED','DISMISSED','SHADOWED') or e.shadowed>0 or e.suppressed>0 then 'excluded'
   when e.targets=0 and e.status='COMPLETED' and e.targets_materialized_at is not null then 'no_target'
   else 'unknown'
  end,
  case when e.status in ('PENDING','PROCESSING','RETRY') then coalesce(e.last_attempted_at,e.created_at)
   else coalesce(e.completed_at,e.dead_lettered_at,e.latest_completed_at,e.success_at,e.created_at) end
 from evidence e;
$function$;

revoke all on function public.admin_push_overview_outcomes(timestamptz, timestamptz) from public, anon, authenticated;


-- Only the scoped CTE differs from the previous production definition.
CREATE OR REPLACE FUNCTION public.get_admin_push_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 with bounds as(
  select date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' starts_at,
   (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul' ends_at
 ), members as(
  select count(*) as total_users,count(*) filter(where enabled is true) as enabled_users,
   count(*) filter(where enabled is false) as disabled_users,count(*) filter(where enabled is null) as unknown_users,
   count(*) filter(where lineup_enabled is true) as lineup_enabled_users,
   count(*) filter(where match_enabled is true and goal_enabled is true) as match_enabled_users,
   count(*) filter(where community_enabled is true) as community_enabled_users,
   count(*) filter(where match_enabled is not null and goal_enabled is not null and match_enabled<>goal_enabled) as match_partial_users
  from public.admin_push_members()
 ), scoped as(
  select d.* from bounds b cross join lateral public.admin_push_overview_outcomes(b.starts_at,b.ends_at) d
  where d.outcome='pending' or d.outcome_at>=b.starts_at and d.outcome_at<b.ends_at
 ), deliveries as(
  select count(*) filter(where outcome='success') today_succeeded,
   count(*) filter(where outcome='partial') today_partial,
   count(*) filter(where outcome not in ('success','pending')) today_failed,
   count(*) filter(where outcome='expired') today_expired,
   count(*) filter(where outcome='unknown') today_unknown,
   count(*) filter(where outcome='no_target') today_no_target,
   count(*) filter(where outcome='excluded') today_excluded,
   count(*) filter(where outcome='pending') pending
  from scoped
 )
 select jsonb_build_object('checked_at',now(),'day_start',b.starts_at,'day_end',b.ends_at)||to_jsonb(m)||to_jsonb(d)
 into result from members m cross join deliveries d cross join bounds b;
 return result;
end;
$function$
;

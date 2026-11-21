-- Record of a forward change already applied to production (KickON) on 2026-11-21 around 22:35 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: get_admin_push_metric_recipients() classified the whole push_outbox history through
-- admin_push_delivery_outcomes() before filtering to today and took 4.9-7.3s against its 5s
-- statement_timeout, so the push metric lists were close to returning HTTP 500.
-- Change: admin_push_metric_outcomes(start, end) returns the same (record, outcome, outcome_at)
-- as admin_push_delivery_outcomes(), but only for today's candidate rows plus open rows. Its body is
-- admin_push_delivery_records()/admin_push_delivery_outcomes() with the bounds passed in and the
-- outbox source narrowed to the same candidates as 20261121124000_admin_push_overview_scoped_outcomes.
-- It runs through EXECUTE ... USING so each call is planned with the actual bounds; as a plain SQL
-- function the generic plan scanned the whole outbox (3.7s versus 44ms on development).
-- Only the matching CTE source of get_admin_push_metric_recipients() changes. The shared
-- functions, the 5s timeout, the admin check and the response shape are unchanged.
--
-- Verification: on development, a temporary copy of the production logic and the new function
-- returned identical (record, outcome, outcome_at) multisets on all 13 days with member rows
-- (81 rows, 0 differences). On production, page 1 of the failure and success lists returned
-- byte-identical JSON before and after the swap (md5 9eba1d09... total 1057, md5 1ccf4408...
-- total 10204) while the call time fell from 7.25s/4.90s to 1.24s/1.36s.
-- Known limit: on development, one load-test day with about 223K outbox rows took 10s.
--
-- Production state before: get_admin_push_metric_recipients md5 8e8e6e79891a7a511d8fc508aaee4d90.
-- Rollback: re-create that previous definition (only its matching CTE source differs), then
-- optionally drop admin_push_metric_outcomes(timestamptz, timestamptz).
-- Requires the six *_v1_idx indexes from 20261121124000.

create or replace function public.admin_push_metric_outcomes(p_starts_at timestamptz, p_ends_at timestamptz) returns table(record jsonb, outcome text, outcome_at timestamptz) language plpgsql stable security definer set search_path to '' as $function$ begin return query execute $q$ with bounds as ( select $1 as starts_at, $2 as ends_at ), candidates as ( select o.id from public.push_outbox o where o.status not in ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER','UNKNOWN_OUTCOME') union select o.id from public.push_outbox o where o.created_at >= $1 and o.created_at < $2 union select o.id from public.push_outbox o where o.completed_at >= $1 and o.completed_at < $2 union select o.id from public.push_outbox o where o.dead_lettered_at >= $1 and o.dead_lettered_at < $2 union select d.outbox_id from public.push_delivery_targets d where d.completed_at >= $1 and d.completed_at < $2 union select a.outbox_id from public.push_delivery_attempts a where a.status = 'SUCCEEDED' and a.completed_at >= $1 and a.completed_at < $2 ), context as ( select o.*,m.nickname,m.team,n.title,n.body, case when n.type='MATCH' then n.data->>'phase' when n.id is null then case split_part(o.effect_key,':',1) when 'fixture-live' then 'KICKOFF' when 'fixture-halftime' then 'HALF_TIME' when 'fixture-second-half' then 'SECOND_HALF' when 'fixture-finished' then 'FULL_TIME' when 'fixture-goal' then 'GOAL' when 'fixture-goal-cancelled' then 'GOAL_CANCELLED' end end as phase, case when n.type='MATCH' then case when n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then 'goal' else 'match' end when n.type='LINEUP' then 'lineup' when n.type='COMMUNITY' then 'community' when n.type='ATTENDANCE' then 'attendance' when n.type='SYSTEM' then 'system' when n.id is null then case split_part(o.effect_key,':',1) when 'fixture-live' then 'match' when 'fixture-halftime' then 'match' when 'fixture-second-half' then 'match' when 'fixture-finished' then 'match' when 'fixture-goal' then 'goal' when 'fixture-goal-cancelled' then 'goal' when 'fixture-lineup' then 'lineup' when 'comment' then 'community' when 'comment-reply' then 'community' when 'post-like' then 'community' when 'attendance-reminder' then 'attendance' end end as kind, case when n.type='MATCH' and n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then m.goal_enabled when n.type in ('MATCH','ATTENDANCE') then m.match_enabled when n.type='LINEUP' then m.lineup_enabled when n.type='COMMUNITY' then m.community_enabled when n.type='SYSTEM' then m.enabled when n.id is null then case split_part(o.effect_key,':',1) when 'fixture-live' then m.match_enabled when 'fixture-halftime' then m.match_enabled when 'fixture-second-half' then m.match_enabled when 'fixture-finished' then m.match_enabled when 'fixture-goal' then m.goal_enabled when 'fixture-goal-cancelled' then m.goal_enabled when 'fixture-lineup' then m.lineup_enabled when 'comment' then m.community_enabled when 'comment-reply' then m.community_enabled when 'post-like' then m.community_enabled when 'attendance-reminder' then m.match_enabled end end as current_preference from candidates c join public.push_outbox o on o.id = c.id join public.admin_push_members() m on m.user_id=o.user_id left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id ), records as ( select r.id, r.user_id, r.nickname, r.team, r.phase, r.title, r.body, r.kind, r.created_at, r.status, case when a.attempts=0 then r.last_error_code else a.last_error_code end as last_error_code, a.last_attempted_at, a.attempts, t.targets, t.succeeded, t.failed, t.pending, t.unknown, t.shadowed, t.suppressed, r.completed_at, greatest(t.success_at,a.success_at) as success_at, (t.success_at is not null or a.success_at is not null) as is_today_success, (r.completed_at>=b.starts_at and r.completed_at<b.ends_at and t.succeeded=0 and t.unknown=0 and r.status<>'UNKNOWN_OUTCOME' and (r.status='DEAD_LETTER' or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY') and t.pending=0 and t.failed>0)) as is_today_failure, (t.succeeded=0 and t.unknown=0 and r.status not in ('UNKNOWN_OUTCOME','DEAD_LETTER','SUPPRESSED','DISMISSED','SHADOWED') and (r.status in ('PENDING','PROCESSING','RETRY') or t.pending>0)) as is_pending from context r cross join bounds b cross join lateral(select count(*) as targets,count(*) filter(where d.status='SUCCEEDED') as succeeded, count(*) filter(where d.status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed, count(*) filter(where d.status in ('PENDING','PROCESSING','RETRY')) as pending,count(*) filter(where d.status='UNKNOWN_OUTCOME') as unknown, count(*) filter(where d.status='SHADOWED') as shadowed,count(*) filter(where d.status='SUPPRESSED') as suppressed, max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=b.starts_at and d.completed_at<b.ends_at) as success_at from public.push_delivery_targets d where d.outbox_id=r.id) t cross join lateral(select count(*) as attempts,max(d.attempted_at) as last_attempted_at, (array_agg(d.error_code order by d.attempted_at desc,d.id desc))[1] as last_error_code, max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=b.starts_at and d.completed_at<b.ends_at) as success_at from public.push_delivery_attempts d where d.outbox_id=r.id) a where r.current_preference is true ), evidence as ( select r.*,o.dead_lettered_at,o.targets_materialized_at, coalesce(t.expired,0) as expired,t.latest_completed_at from records r join public.push_outbox o on o.id=r.id cross join lateral( select count(*) filter(where d.status='SUPPRESSED' and d.last_error_code='PUSH_EXPIRED') as expired, max(d.completed_at) as latest_completed_at from public.push_delivery_targets d where d.outbox_id=r.id ) t ), classified as ( select e.*,case when e.unknown>0 or e.status='UNKNOWN_OUTCOME' then 'unknown' when e.status in ('PENDING','PROCESSING','RETRY') then 'pending' when e.pending>0 and e.status not in ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER') then 'pending' when e.succeeded>0 and (e.succeeded<e.targets or e.status='DEAD_LETTER') then 'partial' when e.succeeded>0 then 'success' when e.status='DEAD_LETTER' then 'failure' when e.status not in ('SUPPRESSED','DISMISSED','SHADOWED') and e.failed>0 then 'failure' when e.expired>0 or e.last_error_code='PUSH_EXPIRED' and e.status='SUPPRESSED' then 'expired' when e.status in ('SUPPRESSED','DISMISSED','SHADOWED') or e.shadowed>0 or e.suppressed>0 then 'excluded' when e.targets=0 and e.status='COMPLETED' and e.targets_materialized_at is not null then 'no_target' else 'unknown' end as delivery_outcome, case when e.status in ('PENDING','PROCESSING','RETRY') then coalesce(e.last_attempted_at,e.created_at) else coalesce(e.completed_at,e.dead_lettered_at,e.latest_completed_at,e.success_at,e.created_at) end as result_at from evidence e ) select to_jsonb(c)-'is_today_success'-'is_today_failure'-'is_pending'-'success_at' -'dead_lettered_at'-'targets_materialized_at'-'latest_completed_at'-'result_at', c.delivery_outcome,c.result_at from classified c $q$ using p_starts_at, p_ends_at; end; $function$;

revoke all on function public.admin_push_metric_outcomes(timestamptz, timestamptz) from public, anon, authenticated;

-- Only the matching CTE source differs from the previous production definition.
CREATE OR REPLACE FUNCTION public.get_admin_push_metric_recipients(p_metric text, p_query text, p_page integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '5s'
AS $function$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_metric is null or p_metric not in ('success','partial','failure','delivery_failure','expired','unknown','no_target','excluded','pending')
  or p_query is null or char_length(p_query)>100 or p_page is null or p_page<1 or p_page>1000000 then raise exception 'INVALID_PUSH_METRIC_FILTER'; end if;
 with bounds as(
  select date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' starts_at,
   (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul' ends_at
 ), matching as materialized(
  select d.record||jsonb_build_object('metric_at',d.outcome_at) as record,d.outcome_at,(d.record->>'id')::uuid id
  from bounds b cross join lateral public.admin_push_metric_outcomes(b.starts_at,b.ends_at) d
  where case when p_metric='failure' then d.outcome not in ('success','pending') when p_metric='delivery_failure' then d.outcome='failure' else d.outcome=p_metric end
   and (p_metric='pending' or d.outcome_at>=b.starts_at and d.outcome_at<b.ends_at)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(d.record->>'nickname','')||' '||(d.record->>'user_id')))>0)
 ), page_rows as(
  select m.record,m.outcome_at,m.id from matching m order by m.outcome_at desc nulls last,m.id desc limit 10 offset (p_page-1)*10
 )
 select jsonb_build_object('total',(select count(*) from matching),
  'rows',coalesce((select jsonb_agg(p.record||jsonb_build_object(
   'expires_at',to_jsonb(o)->'expires_at','targets_materialized_at',o.targets_materialized_at,
   'failure_reasons',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'count',r.count) order by r.count desc,r.code) from (
    select d.last_error_code code,count(*) count from public.push_delivery_targets d
    where d.outbox_id=p.id and d.status<>'SUCCEEDED' and nullif(btrim(d.last_error_code),'') is not null group by d.last_error_code
   ) r),case when coalesce(nullif(btrim(p.record->>'last_error_code'),''),nullif(btrim(o.last_error_code),'')) is not null
    then jsonb_build_array(jsonb_build_object('code',coalesce(nullif(btrim(p.record->>'last_error_code'),''),nullif(btrim(o.last_error_code),'')),'count',null)) else '[]'::jsonb end)
  ) order by p.outcome_at desc nulls last,p.id desc)
  from page_rows p join public.push_outbox o on o.id=p.id),'[]'::jsonb))
 into result;
 return result;
end;
$function$;

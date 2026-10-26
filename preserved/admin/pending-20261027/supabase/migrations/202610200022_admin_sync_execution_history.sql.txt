begin;

-- A family filter groups the daily squad refresh and its retries without
-- claiming that a worker run belongs to a particular cron invocation.
create or replace function public.admin_sync_task_family(p_key text)
returns text language sql immutable set search_path = '' as $$
 select case
  when p_key ~ 'push-outbox-recovery' then 'push'
  when p_key ~ 'attendance-reminder' then 'attendance'
  when p_key ~ 'match-prediction-settlement' then 'prediction'
  when p_key ~ 'admin-resource-monitoring' then 'resources'
  when p_key ~ 'football-provider-usage-retention' then 'retention'
  when p_key ~ 'post-match' then 'post-match'
  when p_key ~ 'history' then 'history'
  when p_key ~ 'squad' then 'squad'
  when p_key ~ 'team-metrics' then 'metrics'
  when p_key ~ 'live' then 'live'
  when p_key ~ 'lineup' then 'lineup'
  when p_key ~ 'goal-backfill' then 'goals'
  else p_key end
$$;
revoke all on function public.admin_sync_task_family(text) from public, anon, authenticated;

create or replace function public.get_admin_sync_execution_history(p_task text default null, p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()), '') <> 'service_role'
  and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_page is null or p_page < 1 or p_page > 100000
  or p_task is not null and (length(p_task) > 200 or p_task !~ '^[A-Za-z0-9_-]+$') then
  raise exception 'INVALID_HISTORY_FILTER';
 end if;
 with evidence as (
  select 'cron:' || d.runid as id, 'schedule'::text as source, j.jobname as job_key,
   d.status::text, d.start_time as started_at, d.end_time as finished_at,
   null::timestamptz as last_succeeded_at, d.return_message as message,
   null::integer as season, null::text as league_id, null::text as target_id,
   'cron'::text as trigger_type, null::jsonb as counts, '[]'::jsonb as quarantines
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
  where j.jobname like 'kickon-%' and d.start_time >= now() - interval '7 days'
  union all
  select 'run:' || r.id, 'run', r.job_key, r.status::text,
   coalesce(r.started_at, r.created_at), r.finished_at, null::timestamptz, r.error_message,
   case when r.metadata->>'internal_season' ~ '^\d{4}$' then (r.metadata->>'internal_season')::integer end,
   coalesce(r.metadata->>'leagueId', r.metadata->>'league'), r.target_id, r.trigger_type,
   jsonb_build_object('inserted', r.inserted_count, 'updated', r.updated_count,
    'skipped', r.skipped_count, 'failed', r.failed_count),
   coalesce((select jsonb_agg(jsonb_build_object(
    'name', coalesce(q->>'playerName', q->>'player_name', '선수 정보'),
    'reason', coalesce(q->>'reason', q->>'code', '확인 필요')))
    from jsonb_array_elements(case when jsonb_typeof(r.metadata->'quarantines') = 'array'
     then r.metadata->'quarantines' else '[]'::jsonb end) q), '[]'::jsonb)
  from public.sync_runs r
  where coalesce(r.started_at, r.created_at) >= now() - interval '7 days'
  union all
  -- State rows are explicitly labelled snapshots, never invented run history.
  select 'state:' || s.sync_key, 'state', s.sync_key,
   case when nullif(btrim(s.last_error), '') is not null then 'failed'
    when s.last_succeeded_at >= s.last_attempted_at then 'succeeded' else 'unknown' end,
   s.last_attempted_at, null::timestamptz, s.last_succeeded_at, s.last_error,
   s.season, s.league_id, null::text, null::text, null::jsonb, '[]'::jsonb
  from public.football_sync_state s
  where s.last_attempted_at >= now() - interval '7 days'
   -- The detailed run is authoritative when the same attempt has a run record.
   and not exists (select 1 from public.sync_runs r where r.job_key = s.sync_key
    and r.started_at = s.last_attempted_at)
 ), filtered as materialized (
  select e.* from evidence e
  where p_task is null or public.admin_sync_task_family(e.job_key) = p_task
 ), page_rows as (
  select * from filtered order by started_at desc, id desc limit 10 offset (p_page - 1) * 10
 ), safe_rows as (
  select p.*, left(regexp_replace(regexp_replace(regexp_replace(regexp_replace(message,
   'sbp_[a-z0-9]+', '[숨김]', 'gi'),
   'Bearer\s+[^\s]+', 'Bearer [숨김]', 'gi'),
   '(api[_-]?token|access_token|apikey)([=:]\s*)[^\s&"'']+', '\1\2[숨김]', 'gi'),
   'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[숨김]', 'g'), 2000) as safe_message
  from page_rows p
 )
 select jsonb_build_object('total', (select count(*) from filtered),
  'rows', coalesce((select jsonb_agg((to_jsonb(p) - 'message' - 'safe_message')
   || jsonb_build_object('message', safe_message) order by started_at desc, id desc)
   from safe_rows p), '[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_sync_execution_history(text, integer) from public, anon, authenticated;
grant execute on function public.get_admin_sync_execution_history(text, integer) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;

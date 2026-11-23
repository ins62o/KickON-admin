-- Record of a forward change already applied to production (KickON) on 2026-11-23 around 12:25 KST through the
-- SQL Editor. This file is a record, not an approval to run it (see README.md).
-- Replaying it is refused by its own guards (definition md5s, USER_ACTIVITY_EXISTS).
--
-- Why: admin screens were slow. The users screen sent 26 sequential admin_get_users calls and every call computed
-- activity for all 2,518 profiles before LIMIT; get_admin_cron_jobs (also called inside get_admin_football_sync_health,
-- which the sync screen polls) read all 90k cron run rows; get_admin_push_recipients sorted every push row together with
-- titles and bodies and probed delivery counts per row; the hourly prune added on 2026-11-22 took 1-3 s at minute 0.
-- Change:
--   1. new public.admin_get_user_activity(): admin_get_users columns for every registered profile in one grouped pass
--      (same users.read check; execute for authenticated and service_role only)
--   2. get_admin_cron_jobs: reads only runs after the last run older than 25 hours (runid index), same output
--   3. get_admin_push_recipients: filters and pages on keys, grouped delivery counts, page rows joined last, same output
--   4. admin_schedule_resource_collection: hourly prune removed
--   5. cron job 18 (kickon-cron-history-retention) also prunes kickon-admin-resource-monitoring runs older than 8 days
-- The Admin users screen switches to admin_get_user_activity in the same pull request; admin_get_users is unchanged.
--
-- Verification before (temporary function copies, always rolled back): user activity 2,518/2,518 rows with identical values and
-- order (313 -> 71 ms for all rows); cron jobs identical, also with a 60-day window holding 189 failures (189 -> 19 ms);
-- push recipients identical for 116 combinations of kind, phase, result, page and query (match kinds 30-35% faster).
-- Verification during the change: outputs of get_admin_cron_jobs and 12 push recipient filters were compared before and
-- after inside the transaction. After: ACLs unchanged and anon cannot execute the new function; job 18 shows the new command.
-- Admin pages after: push recipients (match) 1,734 -> 494 ms, cron jobs 308-1,565 -> 61-148 ms, sync health 936 -> 485-653 ms.
-- New definition md5: get_admin_cron_jobs 8eda556c..., get_admin_push_recipients f0bf319c...,
-- admin_schedule_resource_collection ad91ae07..., admin_get_user_activity 20485dd2....
--
-- Rollback (not part of the change): restore the three previous definitions (md5 d4454022..., c94b12c9..., 55fcb1da...)
-- recorded in 20261121141500 (cron jobs), 20261122000500 (push recipients) and 20261122110900 (resource collection),
-- drop admin_get_user_activity after the Admin users screen is rolled back,
-- and set job 18 back to the 14/90-day command.

-- Admin screens: one call for member activity, a bounded read of cron run history, key-only paging of push recipients,
-- and the hourly prune moved into the daily retention job. One transaction; any guard or comparison failure rolls back all.
do $fix$
declare
  v_cron_before text; v_cron_after text; v_push_before text; v_push_after text; v_count integer;
begin
  perform set_config('lock_timeout', '2s', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  if md5(pg_get_functiondef('public.get_admin_cron_jobs()'::regprocedure)) <> 'd4454022026a0a59d396c8ad60c02964' then raise exception 'CRON_JOBS_DRIFT'; end if;
  if md5(pg_get_functiondef('public.get_admin_push_recipients(text,text,integer,text,text)'::regprocedure)) <> 'c94b12c97f0bfb97b3c53f3833f84488' then raise exception 'PUSH_RECIPIENTS_DRIFT'; end if;
  if md5(pg_get_functiondef('public.admin_schedule_resource_collection()'::regprocedure)) <> '55fcb1da754b38930f89d16002c3bde5' then raise exception 'RESOURCE_SCHEDULER_DRIFT'; end if;
  if to_regprocedure('public.admin_get_user_activity()') is not null then raise exception 'USER_ACTIVITY_EXISTS'; end if;
  if (select regexp_replace(btrim(command), '\s+', ' ', 'g') from cron.job where jobid = 18 and jobname = 'kickon-cron-history-retention' and schedule = '30 18 * * *')
    is distinct from 'delete from cron.job_run_details where (status = ''succeeded'' and start_time < now() - interval ''14 days'') or start_time < now() - interval ''90 days''' then raise exception 'RETENTION_JOB_DRIFT'; end if;

  select md5(string_agg(to_jsonb(job)::text, ',' order by job.job_name)) into v_cron_before from public.get_admin_cron_jobs() job;
  v_push_before := md5(public.get_admin_push_recipients('match_events','',1,'all','all')::text || public.get_admin_push_recipients('match_events','',1,'failure','all')::text || public.get_admin_push_recipients('match_events','',1,'success','GOAL')::text || public.get_admin_push_recipients('match_events','',2,'excluded','all')::text || public.get_admin_push_recipients('match_events','',1,'no_target','KICKOFF')::text || public.get_admin_push_recipients('match','',3,'all','FULL_TIME')::text || public.get_admin_push_recipients('goal','',1,'all','all')::text || public.get_admin_push_recipients('community','',1,'all','all')::text || public.get_admin_push_recipients('community','',1,'failure','all')::text || public.get_admin_push_recipients('lineup','',1,'all','all')::text || public.get_admin_push_recipients('attendance','',1,'success','all')::text || public.get_admin_push_recipients('system','a',1,'all','all')::text);

  execute $ddl$
create function public.admin_get_user_activity()
 returns table(user_id uuid, nickname text, team_id text, team_name text, joined_at timestamp with time zone, post_count bigint, comment_count bigint, attendance_count bigint, received_report_count bigint, recent_activity_at timestamp with time zone, account_status text, suspended_until timestamp with time zone, warning_count bigint)
 language plpgsql stable security definer set search_path = ''
as $fn$
begin
 if not public.admin_has_capability('users.read') then
  raise exception 'USER_ADMIN_PERMISSION_REQUIRED';
 end if;
 -- Same columns and values as admin_get_users for every registered profile, computed once with grouped counts
 -- instead of once per profile and page.
 return query
 with post_stats as (
  select post.author_id as user_id, count(*) as total, max(post.created_at) as latest from public.posts post group by post.author_id
 ), comment_stats as (
  select comment.user_id, count(*) as total, max(comment.created_at) as latest from public.comments comment group by comment.user_id
 ), attendance_stats as (
  select attendance.user_id, count(*) as total, max(attendance.verified_at) as latest from public.attendances attendance group by attendance.user_id
 ), cheer_stats as (
  select cheer.user_id, max(cheer.created_at) as latest from public.fixture_cheer_messages cheer group by cheer.user_id
 ), report_targets as (
  select report.id, post.author_id as user_id from public.content_reports report join public.posts post on post.id = report.post_id
  union
  select report.id, comment.user_id from public.content_reports report join public.comments comment on comment.id = report.comment_id
  union
  select report.id, cheer.user_id from public.content_reports report join public.fixture_cheer_messages cheer on cheer.id = report.cheer_message_id
 ), report_stats as (
  select target.user_id, count(distinct target.id) as total from report_targets target group by target.user_id
 ), warning_stats as (
  select action.user_id, count(*) as total from public.user_moderation_actions action where action.action = 'WARN' group by action.user_id
 )
 select
  profile.id, profile.nickname, profile.team_id, team.name, profile.registration_completed_at,
  coalesce(posts.total, 0)::bigint, coalesce(comments.total, 0)::bigint, coalesce(attendances.total, 0)::bigint,
  coalesce(reports.total, 0)::bigint,
  greatest(posts.latest, comments.latest, attendances.latest, cheers.latest, profile.updated_at),
  case
   when state.account_suspended_until > now() then 'ACCOUNT_SUSPENDED'
   when state.suspended_until > now() then 'COMMUNITY_SUSPENDED'
   else 'ACTIVE'
  end,
  case
   when state.account_suspended_until > now() then state.account_suspended_until
   when state.suspended_until > now() then state.suspended_until
   else null
  end,
  coalesce(warnings.total, 0)::bigint
 from public.profiles profile
 left join public.teams team on team.id = profile.team_id
 left join public.user_moderation_states state on state.user_id = profile.id
 left join post_stats posts on posts.user_id = profile.id
 left join comment_stats comments on comments.user_id = profile.id
 left join attendance_stats attendances on attendances.user_id = profile.id
 left join cheer_stats cheers on cheers.user_id = profile.id
 left join report_stats reports on reports.user_id = profile.id
 left join warning_stats warnings on warnings.user_id = profile.id
 where profile.registration_completed_at is not null
 order by 10 desc nulls last, profile.registration_completed_at desc;
end;
$fn$;
  $ddl$;
  revoke all on function public.admin_get_user_activity() from public, anon;
  grant execute on function public.admin_get_user_activity() to authenticated, service_role;

  execute $ddl$
create or replace function public.get_admin_cron_jobs()
 returns table(job_id bigint, job_name text, schedule text, active boolean, last_status text, last_started_at timestamp with time zone, last_finished_at timestamp with time zone, last_message text, failure_count_24h bigint)
 language plpgsql stable security definer set search_path = ''
as $fn$
begin
 if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then raise exception 'ADMIN_REQUIRED'; end if;
 -- cron.job_run_details is indexed only by runid. runid grows with start time, so one backward index scan finds the last
 -- run that started more than 25 hours ago, and only the runs after it are read (instead of the whole history).
 return query
 with kickon as materialized (
  select job.jobid, job.jobname, job.schedule, job.active from cron.job job where job.jobname like 'kickon-%'
 ), boundary as materialized (
  select coalesce((select detail.runid from cron.job_run_details detail
   where detail.start_time < now() - interval '25 hours' order by detail.runid desc limit 1), 0) as runid
 ), window_runs as materialized (
  select detail.jobid, detail.status, detail.start_time, detail.end_time, detail.return_message
  from cron.job_run_details detail
  where detail.runid > (select boundary.runid from boundary) and detail.jobid in (select kickon.jobid from kickon)
 ), recent as (
  select distinct on (run.jobid) run.jobid, run.status, run.start_time, run.end_time, run.return_message
  from window_runs run order by run.jobid, run.start_time desc
 ), statistics as (
  select run.jobid, count(*) as failure_count_24h from window_runs run
  where run.start_time >= now() - interval '24 hours' and run.status not in ('succeeded', 'running') group by run.jobid
 )
 select job.jobid, job.jobname, job.schedule, job.active,
  coalesce(recent.status, older.status), coalesce(recent.start_time, older.start_time),
  coalesce(recent.end_time, older.end_time), coalesce(recent.return_message, older.return_message),
  coalesce(statistics.failure_count_24h, 0)
 from kickon job
 left join recent on recent.jobid = job.jobid
 -- A job with no run in the window (e.g. paused) still shows its last run.
 left join lateral (
  select detail.status, detail.start_time, detail.end_time, detail.return_message from cron.job_run_details detail
  where recent.jobid is null and detail.jobid = job.jobid order by detail.start_time desc limit 1
 ) older on true
 left join statistics on statistics.jobid = job.jobid
 order by job.jobname;
end;
$fn$;
  $ddl$;

  execute $ddl$
create or replace function public.get_admin_push_recipients(p_kind text, p_query text, p_page integer, p_result text, p_phase text)
 returns jsonb
 language plpgsql stable security definer set search_path = '' set statement_timeout = '5s'
as $fn$
declare result jsonb;
begin
 if coalesce((select auth.role()),'') <> 'service_role' and not public.is_admin('viewer'::public.admin_role) then
  raise exception 'ADMIN_REQUIRED';
 end if;
 if p_kind is null or p_kind not in ('match','match_events','goal','lineup','community','attendance','system')
  or p_phase is null or p_phase not in ('all','KICKOFF','HALF_TIME','SECOND_HALF','FULL_TIME','GOAL','GOAL_CANCELLED')
  or p_kind not in ('match','match_events') and p_phase<>'all'
  or p_kind<>'match_events' and p_phase in ('GOAL','GOAL_CANCELLED')
  or p_result is null or p_result not in ('all','success','failure','excluded','no_target')
  or p_page is null or p_page<1 or p_page>1000000 or p_query is null or char_length(p_query)>100 then
  raise exception 'INVALID_PUSH_HISTORY_FILTER';
 end if;
 -- Filtering and paging carry only keys; titles, bodies and teams are read for the 10 page rows only.
 with records as (
  select o.id,o.user_id,o.notification_id,p.nickname,o.created_at,o.status,o.last_error_code,
   case p_kind when 'match_events' then case
    when n.type='MATCH' and n.data->>'phase' in ('GOAL','GOAL_CANCELLED')
      or n.id is null and split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then pref.goal_notifications_enabled
    else pref.match_notifications_enabled end
    when 'match' then pref.match_notifications_enabled when 'attendance' then pref.match_notifications_enabled
    when 'goal' then pref.goal_notifications_enabled when 'lineup' then pref.lineup_notifications_enabled
    when 'community' then pref.community_notifications_enabled
    when 'system' then (pref.match_notifications_enabled or pref.goal_notifications_enabled or pref.lineup_notifications_enabled or pref.community_notifications_enabled) end as current_preference,
   case when n.type='MATCH' then n.data->>'phase' when n.id is null then case split_part(o.effect_key,':',1)
    when 'fixture-live' then 'KICKOFF' when 'fixture-halftime' then 'HALF_TIME'
    when 'fixture-second-half' then 'SECOND_HALF' when 'fixture-finished' then 'FULL_TIME'
    when 'fixture-goal' then 'GOAL' when 'fixture-goal-cancelled' then 'GOAL_CANCELLED' end end as phase,
   case when n.type='MATCH' then case when n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then 'goal' else 'match' end
    when n.type='LINEUP' then 'lineup' when n.type='COMMUNITY' then 'community'
    when n.type='ATTENDANCE' then 'attendance' when n.type='SYSTEM' then 'system'
    when n.id is null then case
      when split_part(o.effect_key,':',1) in ('fixture-live','fixture-halftime','fixture-second-half','fixture-finished') then 'match'
      when split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then 'goal'
      when split_part(o.effect_key,':',1)='fixture-lineup' then 'lineup'
      when split_part(o.effect_key,':',1) in ('comment','comment-reply','post-like') then 'community'
      when split_part(o.effect_key,':',1)='attendance-reminder' then 'attendance'
    end end as kind
  from public.push_outbox o
  left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
  left join public.notification_preferences pref on pref.user_id=o.user_id
  left join public.profiles p on p.id=o.user_id
 ), candidates as materialized (
  select r.id,r.user_id,r.notification_id,r.nickname,r.created_at,r.status,r.last_error_code,r.phase from records r
  where (r.kind=p_kind or p_kind='match_events' and r.kind in ('match','goal')) and r.current_preference is true and (p_phase='all' or r.phase=p_phase)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(r.nickname,'')||' '||r.user_id::text))>0)
 ), delivery as (
  -- Counted once per parent with one grouped pass instead of two index probes per candidate.
  select t.outbox_id,count(*) as targets,
   count(*) filter(where t.status='SUCCEEDED') as succeeded,
   count(*) filter(where t.status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   count(*) filter(where t.status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where t.status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where t.status='SHADOWED') as shadowed,
   count(*) filter(where t.status='SUPPRESSED') as suppressed
  from public.push_delivery_targets t where p_result<>'all' group by t.outbox_id
 ), attempts as (
  select a.outbox_id,count(*) as attempt_count from public.push_delivery_attempts a where p_result<>'all' group by a.outbox_id
 ), matching as materialized (
  select r.id,r.created_at from (
   select c.id,c.created_at,c.status,coalesce(d.targets,0) as targets,coalesce(d.succeeded,0) as succeeded,coalesce(d.failed,0) as failed,
    coalesce(d.pending,0) as pending,coalesce(d.unknown,0) as unknown,coalesce(d.shadowed,0) as shadowed,
    coalesce(d.suppressed,0) as suppressed,coalesce(h.attempt_count,0) as attempt_count
   from candidates c left join delivery d on d.outbox_id=c.id left join attempts h on h.outbox_id=c.id
   where p_result<>'all'
  ) r
  where p_result='success' and r.succeeded>0
   or p_result='failure' and r.succeeded=0 and r.unknown=0 and r.status<>'UNKNOWN_OUTCOME'
    and (r.status='DEAD_LETTER'
     or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY')
      and r.pending=0 and r.failed>0)
   or p_result='excluded' and r.succeeded=0 and r.unknown=0
    and r.status not in ('UNKNOWN_OUTCOME','DEAD_LETTER')
    and (r.status in ('SUPPRESSED','DISMISSED')
     or r.status not in ('SHADOWED','PENDING','PROCESSING','RETRY')
      and r.pending=0 and r.failed=0 and r.shadowed=0 and r.suppressed>0)
   or p_result='no_target' and r.status='COMPLETED' and r.targets=0 and r.attempt_count=0
 ), filtered as (
  -- 'all' pages straight from the candidates; the other filters need the delivery counts first
  select id,created_at from candidates where p_result='all'
  union all
  select id,created_at from matching
 ), page_keys as (
  select id from filtered order by created_at desc,id desc limit 10 offset (p_page-1)*10
 ), page_rows as (
  select r.id,r.user_id,r.nickname,case when team.id is not null then jsonb_build_object('id',team.id,'name',team.name,'code',team.code) end as team,
   n.title,n.body,r.created_at,r.status,r.last_error_code,r.phase,targets.*,history.attempt_count
  from candidates r
  join page_keys k on k.id=r.id
  left join public.notifications n on n.id=r.notification_id and n.user_id=r.user_id
  left join public.profiles p on p.id=r.user_id
  left join public.teams team on team.id=p.team_id
  cross join lateral (select count(*) as targets,
   count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status='SHADOWED') as shadowed,
   count(*) filter(where status='SUPPRESSED') as suppressed
   from public.push_delivery_targets where outbox_id=r.id) targets
  cross join lateral (select count(*) as attempt_count from public.push_delivery_attempts where outbox_id=r.id) history
 )
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'user_id',r.user_id,'nickname',r.nickname,'team',r.team,'phase',r.phase,'title',r.title,'body',r.body,
   'created_at',r.created_at,'status',r.status,'last_error_code',case when latest.attempted_at is null then r.last_error_code else latest.error_code end,
   'last_attempted_at',latest.attempted_at,'attempts',r.attempt_count,
   'targets',r.targets,'succeeded',r.succeeded,'failed',r.failed,'pending',r.pending,
   'unknown',r.unknown,'shadowed',r.shadowed,'suppressed',r.suppressed
  ) order by r.created_at desc,r.id desc)
  from page_rows r
  left join lateral (select attempted_at,error_code from public.push_delivery_attempts where outbox_id=r.id order by attempted_at desc,id desc limit 1) latest on true
 ),'[]'::jsonb)) into result;
 return result;
end;
$fn$;
  $ddl$;

  execute $ddl$
create or replace function public.admin_schedule_resource_collection()
 returns bigint
 language plpgsql security definer set search_path = ''
as $fn$
declare project_url text; token text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='kickon_monitoring_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='kickon_monitoring_cron_secret';
 if project_url is null or token is null then raise exception 'Monitoring is not configured'; end if;
 -- Old runs of this job are pruned once a day by kickon-cron-history-retention.
 return net.http_post(url:=project_url||'/functions/v1/collect-admin-resources',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=30000);
end
$fn$;
  $ddl$;

  perform cron.alter_job(18, command := 'delete from cron.job_run_details where (status = ''succeeded'' and start_time < now() - interval ''14 days'') or start_time < now() - interval ''90 days'' or (jobid = (select job.jobid from cron.job job where job.jobname = ''kickon-admin-resource-monitoring'') and end_time < now() - interval ''8 days'')');

  select md5(string_agg(to_jsonb(job)::text, ',' order by job.job_name)) into v_cron_after from public.get_admin_cron_jobs() job;
  v_push_after := md5(public.get_admin_push_recipients('match_events','',1,'all','all')::text || public.get_admin_push_recipients('match_events','',1,'failure','all')::text || public.get_admin_push_recipients('match_events','',1,'success','GOAL')::text || public.get_admin_push_recipients('match_events','',2,'excluded','all')::text || public.get_admin_push_recipients('match_events','',1,'no_target','KICKOFF')::text || public.get_admin_push_recipients('match','',3,'all','FULL_TIME')::text || public.get_admin_push_recipients('goal','',1,'all','all')::text || public.get_admin_push_recipients('community','',1,'all','all')::text || public.get_admin_push_recipients('community','',1,'failure','all')::text || public.get_admin_push_recipients('lineup','',1,'all','all')::text || public.get_admin_push_recipients('attendance','',1,'success','all')::text || public.get_admin_push_recipients('system','a',1,'all','all')::text);
  if v_cron_after is distinct from v_cron_before then raise exception 'CRON_JOBS_OUTPUT_CHANGED'; end if;
  if v_push_after is distinct from v_push_before then raise exception 'PUSH_RECIPIENTS_OUTPUT_CHANGED'; end if;

  select count(*) into v_count from pg_proc p
  where p.oid in ('public.admin_get_user_activity()'::regprocedure, 'public.get_admin_cron_jobs()'::regprocedure,
    'public.get_admin_push_recipients(text,text,integer,text,text)'::regprocedure, 'public.admin_get_users(text,integer,integer)'::regprocedure)
    and p.prosecdef and p.proconfig @> array['search_path=""']
    and array(select a::text from unnest(p.proacl) a order by 1) = array['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'];
  if v_count <> 4 then raise exception 'FUNCTION_ACL_CHECK %', v_count; end if;
  if (select array(select a::text from unnest(proacl) a order by 1) from pg_proc where oid = 'public.admin_schedule_resource_collection()'::regprocedure)
    <> array['postgres=X/postgres'] then raise exception 'SCHEDULER_ACL_CHECK'; end if;
  if (select command from cron.job where jobid = 18) <> 'delete from cron.job_run_details where (status = ''succeeded'' and start_time < now() - interval ''14 days'') or start_time < now() - interval ''90 days'' or (jobid = (select job.jobid from cron.job job where job.jobname = ''kickon-admin-resource-monitoring'') and end_time < now() - interval ''8 days'')' then raise exception 'RETENTION_JOB_CHECK'; end if;
end
$fix$;

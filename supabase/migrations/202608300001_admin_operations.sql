-- KickOn Data Center: additive operational schema.
-- This migration does not change the mobile application's existing football tables.

create type public.admin_role as enum ('viewer', 'operator', 'admin', 'super_admin');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'rejected', 'on_hold');
create type public.report_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.sync_run_status as enum ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled');
create type public.error_group_status as enum ('open', 'investigating', 'resolved', 'ignored');

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null default 'viewer',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.admin_users is
  'Supabase Auth 사용자와 별도로 관리하는 킥온 데이터 센터 역할. 서비스 역할로 첫 super_admin을 등록해야 한다.';

create or replace function public.admin_role_rank(role_to_rank public.admin_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role_to_rank
    when 'viewer' then 10
    when 'operator' then 20
    when 'admin' then 30
    when 'super_admin' then 40
  end;
$$;

create or replace function public.is_admin(required_role public.admin_role default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users administrator
    where administrator.user_id = (select auth.uid())
      and administrator.is_active
      and public.admin_role_rank(administrator.role) >= public.admin_role_rank(required_role)
  );
$$;

revoke all on function public.admin_role_rank(public.admin_role) from public, anon;
revoke all on function public.is_admin(public.admin_role) from public, anon;
grant execute on function public.admin_role_rank(public.admin_role) to authenticated, service_role;
grant execute on function public.is_admin(public.admin_role) to authenticated, service_role;

create or replace function public.get_admin_cron_jobs()
returns table (
  job_id bigint,
  job_name text,
  schedule text,
  active boolean,
  last_status text,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_message text,
  failure_count_24h bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

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
  left join lateral (
    select detail.status, detail.start_time, detail.end_time, detail.return_message
    from cron.job_run_details detail
    where detail.jobid = job.jobid
    order by detail.start_time desc
    limit 1
  ) recent on true
  left join lateral (
    select count(*) as failure_count_24h
    from cron.job_run_details detail
    where detail.jobid = job.jobid
      and detail.start_time >= now() - interval '24 hours'
      and detail.status not in ('succeeded', 'running')
  ) statistics on true
  where job.jobname like 'kickon-%'
  order by job.jobname;
end;
$$;

create or replace function public.get_admin_provider_usage(since_at timestamptz)
returns table (
  observed_at timestamptz,
  source text,
  endpoint text,
  requested_entity text,
  remaining integer,
  resets_in_seconds integer,
  status_code integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select
    usage.observed_at,
    usage.source,
    usage.endpoint,
    usage.requested_entity,
    usage.remaining,
    usage.resets_in_seconds,
    usage.status_code
  from public.football_provider_usage usage
  where usage.observed_at >= greatest(since_at, now() - interval '60 days')
  order by usage.observed_at desc
  limit 20000;
end;
$$;

create or replace function public.get_admin_table_counts()
returns table (table_name text, row_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  select 'teams', count(*) from public.teams
  union all select 'team_players', count(*) from public.team_players
  union all select 'fixtures', count(*) from public.fixtures
  union all select 'league_standings', count(*) from public.league_standings
  union all select 'player_scoring_stats', count(*) from public.player_scoring_stats
  union all select 'profiles', count(*) from public.profiles
  union all select 'posts', count(*) from public.posts
  union all select 'comments', count(*) from public.comments
  union all select 'notifications', count(*) from public.notifications
  union all select 'push_tokens', count(*) from public.push_tokens;
end;
$$;

revoke all on function public.get_admin_cron_jobs() from public, anon;
revoke all on function public.get_admin_provider_usage(timestamptz) from public, anon;
revoke all on function public.get_admin_table_counts() from public, anon;
grant execute on function public.get_admin_cron_jobs() to authenticated, service_role;
grant execute on function public.get_admin_provider_usage(timestamptz) to authenticated, service_role;
grant execute on function public.get_admin_table_counts() to authenticated, service_role;

create table public.user_data_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'player', 'fixture', 'standing', 'ranking', 'other')),
  entity_id text,
  field_path text,
  current_value jsonb,
  proposed_value jsonb,
  description text not null check (char_length(description) between 3 and 4000),
  evidence_urls text[] not null default '{}',
  status public.report_status not null default 'open',
  priority public.report_priority not null default 'normal',
  assignee_id uuid references public.admin_users(user_id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_data_reports_queue_idx
  on public.user_data_reports (status, priority, created_at desc);
create index user_data_reports_reporter_idx
  on public.user_data_reports (reporter_id, created_at desc);

create table public.user_data_report_history (
  id bigint generated by default as identity primary key,
  report_id uuid not null references public.user_data_reports(id) on delete cascade,
  from_status public.report_status,
  to_status public.report_status not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index user_data_report_history_report_idx
  on public.user_data_report_history (report_id, created_at desc);

create table public.error_groups (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null check (source in ('ios', 'android', 'web', 'edge_function', 'database', 'cron', 'other')),
  title text not null,
  error_type text,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'fatal')),
  status public.error_group_status not null default 'open',
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  event_count bigint not null default 1 check (event_count >= 0),
  affected_user_count bigint check (affected_user_count is null or affected_user_count >= 0),
  latest_release text,
  latest_environment text,
  latest_os_name text,
  latest_os_version text,
  latest_device_model text,
  latest_route text,
  latest_api_endpoint text,
  latest_http_status integer,
  assignee_id uuid references public.admin_users(user_id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index error_groups_queue_idx
  on public.error_groups (status, severity, last_seen_at desc);

create table public.error_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.error_groups(id) on delete cascade,
  occurred_at timestamptz not null,
  environment text,
  release text,
  error_type text,
  os_name text,
  os_version text,
  device_model text,
  route text,
  api_endpoint text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  operation text,
  message text,
  stack_trace text,
  user_id_hash text,
  request_id text,
  sanitized_context jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on column public.error_events.sanitized_context is
  '수집 전에 토큰, 이메일, 전화번호, 원문 사용자 ID 등 민감정보를 제거한 컨텍스트만 저장한다.';

create index error_events_group_occurred_idx
  on public.error_events (group_id, occurred_at desc);
create index error_events_occurred_idx
  on public.error_events (occurred_at desc);
create index error_events_release_occurred_idx
  on public.error_events (release, occurred_at desc);

create or replace function public.get_admin_error_summary(since_at timestamptz)
returns table (
  total_events bigint,
  affected_users bigint,
  fatal_events bigint,
  open_groups bigint,
  top_group_id uuid,
  top_group_title text,
  top_group_events bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  with scoped as (
    select event.group_id, event.user_id_hash
    from public.error_events event
    where event.occurred_at >= since_at
  ), grouped as (
    select scoped.group_id, count(*) as event_count
    from scoped
    group by scoped.group_id
    order by event_count desc
    limit 1
  )
  select
    (select count(*) from scoped),
    (select count(distinct user_id_hash) from scoped where user_id_hash is not null),
    (select count(*) from scoped join public.error_groups fatal_group on fatal_group.id = scoped.group_id where fatal_group.severity = 'fatal'),
    (select count(*) from public.error_groups open_group where open_group.status in ('open', 'investigating')),
    top_group.id,
    top_group.title,
    grouped.event_count
  from (select 1) anchor
  left join grouped on true
  left join public.error_groups top_group on top_group.id = grouped.group_id;
end;
$$;

create or replace function public.get_admin_error_breakdown(since_at timestamptz)
returns table (dimension text, value text, event_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  with breakdown as (
    select 'release'::text as dimension, coalesce(nullif(event.release, ''), '확인 불가') as value, count(*) as event_count
    from public.error_events event where event.occurred_at >= since_at group by coalesce(nullif(event.release, ''), '확인 불가')
    union all
    select 'route', coalesce(nullif(event.route, ''), '확인 불가'), count(*)
    from public.error_events event where event.occurred_at >= since_at group by coalesce(nullif(event.route, ''), '확인 불가')
    union all
    select 'os', concat_ws(' ', coalesce(nullif(event.os_name, ''), '확인 불가'), nullif(event.os_version, '')), count(*)
    from public.error_events event where event.occurred_at >= since_at group by concat_ws(' ', coalesce(nullif(event.os_name, ''), '확인 불가'), nullif(event.os_version, ''))
  ), ranked as (
    select breakdown.*, row_number() over (partition by breakdown.dimension order by breakdown.event_count desc, breakdown.value) as rank
    from breakdown
  )
  select ranked.dimension, ranked.value, ranked.event_count
  from ranked
  where ranked.rank <= 10
  order by ranked.dimension, ranked.event_count desc;
end;
$$;

create or replace function public.get_admin_error_spikes()
returns table (
  group_id uuid,
  title text,
  last_hour_events bigint,
  baseline_hourly numeric,
  increase_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin('viewer') and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return query
  with counts as (
    select
      event.group_id,
      count(*) filter (where event.occurred_at >= now() - interval '1 hour') as last_hour,
      count(*) filter (
        where event.occurred_at >= now() - interval '7 hours'
          and event.occurred_at < now() - interval '1 hour'
      ) / 6.0 as baseline
    from public.error_events event
    where event.occurred_at >= now() - interval '7 hours'
    group by event.group_id
  )
  select
    error_group.id,
    error_group.title,
    counts.last_hour,
    round(counts.baseline, 1),
    case
      when counts.baseline = 0 then null
      else round(((counts.last_hour - counts.baseline) / counts.baseline) * 100, 1)
    end
  from counts
  join public.error_groups error_group on error_group.id = counts.group_id
  where counts.last_hour >= 3
    and (counts.baseline = 0 or counts.last_hour >= counts.baseline * 2)
  order by counts.last_hour desc
  limit 10;
end;
$$;

create or replace function public.ingest_sanitized_error_event(
  p_fingerprint text,
  p_source text,
  p_title text,
  p_error_type text,
  p_severity text,
  p_occurred_at timestamptz,
  p_environment text,
  p_release text,
  p_os_name text,
  p_os_version text,
  p_device_model text,
  p_route text,
  p_api_endpoint text,
  p_http_status integer,
  p_operation text,
  p_message text,
  p_stack_trace text,
  p_user_id_hash text,
  p_request_id text,
  p_sanitized_context jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  safe_occurred_at timestamptz := greatest(now() - interval '90 days', least(coalesce(p_occurred_at, now()), now() + interval '5 minutes'));
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if char_length(p_fingerprint) < 16 or char_length(p_title) < 1 then
    raise exception 'INVALID_ERROR_EVENT';
  end if;

  insert into public.error_groups (
    fingerprint, source, title, error_type, severity, first_seen_at, last_seen_at,
    event_count, latest_release, latest_environment, latest_os_name, latest_os_version,
    latest_device_model, latest_route, latest_api_endpoint, latest_http_status
  ) values (
    left(p_fingerprint, 200), p_source, left(p_title, 500), nullif(left(p_error_type, 120), ''), p_severity,
    safe_occurred_at, safe_occurred_at, 1, nullif(left(p_release, 120), ''), nullif(left(p_environment, 80), ''),
    nullif(left(p_os_name, 80), ''), nullif(left(p_os_version, 80), ''), nullif(left(p_device_model, 160), ''),
    nullif(left(p_route, 500), ''), nullif(left(p_api_endpoint, 500), ''), p_http_status
  )
  on conflict (fingerprint) do update set
    last_seen_at = greatest(public.error_groups.last_seen_at, excluded.last_seen_at),
    event_count = public.error_groups.event_count + 1,
    latest_release = coalesce(excluded.latest_release, public.error_groups.latest_release),
    latest_environment = coalesce(excluded.latest_environment, public.error_groups.latest_environment),
    latest_os_name = coalesce(excluded.latest_os_name, public.error_groups.latest_os_name),
    latest_os_version = coalesce(excluded.latest_os_version, public.error_groups.latest_os_version),
    latest_device_model = coalesce(excluded.latest_device_model, public.error_groups.latest_device_model),
    latest_route = coalesce(excluded.latest_route, public.error_groups.latest_route),
    latest_api_endpoint = coalesce(excluded.latest_api_endpoint, public.error_groups.latest_api_endpoint),
    latest_http_status = coalesce(excluded.latest_http_status, public.error_groups.latest_http_status),
    updated_at = now()
  returning id into target_group_id;

  insert into public.error_events (
    group_id, occurred_at, environment, release, error_type, os_name, os_version,
    device_model, route, api_endpoint, http_status, operation, message, stack_trace,
    user_id_hash, request_id, sanitized_context
  ) values (
    target_group_id, safe_occurred_at, nullif(left(p_environment, 80), ''), nullif(left(p_release, 120), ''),
    nullif(left(p_error_type, 120), ''), nullif(left(p_os_name, 80), ''), nullif(left(p_os_version, 80), ''),
    nullif(left(p_device_model, 160), ''), nullif(left(p_route, 500), ''), nullif(left(p_api_endpoint, 500), ''),
    p_http_status, nullif(left(p_operation, 200), ''), nullif(left(p_message, 2000), ''),
    nullif(left(p_stack_trace, 20000), ''), nullif(left(p_user_id_hash, 128), ''),
    nullif(left(p_request_id, 200), ''), coalesce(p_sanitized_context, '{}'::jsonb)
  );

  if p_user_id_hash is not null and p_user_id_hash <> '' then
    update public.error_groups
    set affected_user_count = (
      select count(distinct event.user_id_hash)
      from public.error_events event
      where event.group_id = target_group_id and event.user_id_hash is not null
    )
    where id = target_group_id;
  end if;

  return target_group_id;
end;
$$;

revoke all on function public.get_admin_error_summary(timestamptz) from public, anon;
revoke all on function public.get_admin_error_breakdown(timestamptz) from public, anon;
revoke all on function public.get_admin_error_spikes() from public, anon;
revoke all on function public.ingest_sanitized_error_event(text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.get_admin_error_summary(timestamptz) to authenticated, service_role;
grant execute on function public.get_admin_error_breakdown(timestamptz) to authenticated, service_role;
grant execute on function public.get_admin_error_spikes() to authenticated, service_role;
grant execute on function public.ingest_sanitized_error_event(text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,integer,text,text,text,text,text,jsonb) to service_role;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  target_type text,
  target_id text,
  trigger_type text not null check (trigger_type in ('cron', 'manual', 'webhook', 'retry', 'system')),
  environment text not null check (environment in ('development', 'production')),
  status public.sync_run_status not null default 'queued',
  requested_by uuid references public.admin_users(user_id) on delete set null,
  reason text,
  started_at timestamptz,
  finished_at timestamptz,
  inserted_count integer check (inserted_count is null or inserted_count >= 0),
  updated_count integer check (updated_count is null or updated_count >= 0),
  skipped_count integer check (skipped_count is null or skipped_count >= 0),
  failed_count integer check (failed_count is null or failed_count >= 0),
  provider_request_count integer check (provider_request_count is null or provider_request_count >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sync_runs_job_created_idx on public.sync_runs (job_key, created_at desc);
create index sync_runs_status_created_idx on public.sync_runs (status, created_at desc);

create table public.sync_run_items (
  id bigint generated by default as identity primary key,
  run_id uuid not null references public.sync_runs(id) on delete cascade,
  entity_type text not null,
  entity_id text,
  operation text check (operation in ('insert', 'update', 'skip', 'fail')),
  status public.sync_run_status not null,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index sync_run_items_run_idx on public.sync_run_items (run_id, id);

create table public.manual_overrides (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('team', 'player', 'fixture', 'standing', 'ranking')),
  entity_id text not null,
  field_path text not null,
  original_value jsonb,
  override_value jsonb not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  blocks_sync boolean not null default false,
  created_by uuid not null references public.admin_users(user_id) on delete restrict,
  released_by uuid references public.admin_users(user_id) on delete set null,
  released_at timestamptz,
  release_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((released_at is null and released_by is null) or released_at is not null)
);

create unique index manual_overrides_active_field_idx
  on public.manual_overrides (entity_type, entity_id, field_path)
  where released_at is null;
create index manual_overrides_entity_idx
  on public.manual_overrides (entity_type, entity_id, created_at desc);

comment on table public.manual_overrides is
  '원본 축구 테이블을 직접 덮어쓰지 않는 필드 단위 운영 보정 레이어.';

create table public.admin_audit_logs (
  id bigint generated by default as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.admin_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  before_value jsonb,
  after_value jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);
create index admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_id, created_at desc);

create or replace function public.set_admin_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger admin_users_set_updated_at before update on public.admin_users
  for each row execute function public.set_admin_updated_at();
create trigger user_data_reports_set_updated_at before update on public.user_data_reports
  for each row execute function public.set_admin_updated_at();
create trigger error_groups_set_updated_at before update on public.error_groups
  for each row execute function public.set_admin_updated_at();
create trigger sync_runs_set_updated_at before update on public.sync_runs
  for each row execute function public.set_admin_updated_at();
create trigger manual_overrides_set_updated_at before update on public.manual_overrides
  for each row execute function public.set_admin_updated_at();

create or replace function public.record_report_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_data_report_history (
      report_id, from_status, to_status, note, changed_by
    ) values (
      new.id, null, new.status, new.resolution_note, (select auth.uid())
    );
  elsif old.status is distinct from new.status then
    insert into public.user_data_report_history (
      report_id, from_status, to_status, note, changed_by
    ) values (
      new.id, old.status, new.status, new.resolution_note, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

create trigger user_data_reports_record_status
  after update of status on public.user_data_reports
  for each row execute function public.record_report_status_change();
create trigger user_data_reports_record_initial_status
  after insert on public.user_data_reports
  for each row execute function public.record_report_status_change();

create or replace function public.record_admin_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  current_role public.admin_role;
  row_id text;
  audit_reason text;
begin
  select administrator.role into current_role
  from public.admin_users administrator
  where administrator.user_id = current_actor;

  if tg_table_name = 'manual_overrides' then
    row_id := coalesce(to_jsonb(new)->>'entity_id', to_jsonb(old)->>'entity_id');
  elsif tg_table_name = 'player_change_events' then
    row_id := coalesce(to_jsonb(new)->>'player_id', to_jsonb(old)->>'player_id');
  else
    row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  end if;
  audit_reason := coalesce(
    to_jsonb(new)->>'release_reason',
    to_jsonb(new)->>'resolution_note',
    to_jsonb(new)->>'reason'
  );

  insert into public.admin_audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, reason, before_value, after_value
  ) values (
    current_actor,
    current_role,
    tg_op,
    tg_table_name,
    row_id,
    audit_reason,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger admin_users_audit after insert or update or delete on public.admin_users
  for each row execute function public.record_admin_audit_log();
create trigger user_data_reports_audit after update on public.user_data_reports
  for each row execute function public.record_admin_audit_log();
create trigger error_groups_audit after update on public.error_groups
  for each row execute function public.record_admin_audit_log();
create trigger manual_overrides_audit after insert or update or delete on public.manual_overrides
  for each row execute function public.record_admin_audit_log();

alter table public.admin_users enable row level security;
alter table public.user_data_reports enable row level security;
alter table public.user_data_report_history enable row level security;
alter table public.error_groups enable row level security;
alter table public.error_events enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_run_items enable row level security;
alter table public.manual_overrides enable row level security;
alter table public.admin_audit_logs enable row level security;

create policy "admins read own membership" on public.admin_users
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin('super_admin'));
create policy "super admins create memberships" on public.admin_users
  for insert to authenticated with check (public.is_admin('super_admin'));
create policy "super admins update memberships" on public.admin_users
  for update to authenticated using (public.is_admin('super_admin')) with check (public.is_admin('super_admin'));
create policy "super admins delete memberships" on public.admin_users
  for delete to authenticated using (public.is_admin('super_admin'));

create policy "users create own data reports" on public.user_data_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "users read own data reports" on public.user_data_reports
  for select to authenticated using (reporter_id = (select auth.uid()) or public.is_admin('viewer'));
create policy "operators update data reports" on public.user_data_reports
  for update to authenticated using (public.is_admin('operator')) with check (public.is_admin('operator'));
create policy "admins read report history" on public.user_data_report_history
  for select to authenticated using (public.is_admin('viewer'));

create policy "admins read error groups" on public.error_groups
  for select to authenticated using (public.is_admin('viewer'));
create policy "operators update error groups" on public.error_groups
  for update to authenticated using (public.is_admin('operator')) with check (public.is_admin('operator'));
create policy "admins read error events" on public.error_events
  for select to authenticated using (public.is_admin('viewer'));

create policy "admins read sync runs" on public.sync_runs
  for select to authenticated using (public.is_admin('viewer'));
create policy "operators create sync runs" on public.sync_runs
  for insert to authenticated with check (public.is_admin('operator') and requested_by = (select auth.uid()));
create policy "operators update sync runs" on public.sync_runs
  for update to authenticated using (public.is_admin('operator')) with check (public.is_admin('operator'));
create policy "admins read sync run items" on public.sync_run_items
  for select to authenticated using (public.is_admin('viewer'));

create policy "admins read overrides" on public.manual_overrides
  for select to authenticated using (public.is_admin('viewer'));
create policy "admins create overrides" on public.manual_overrides
  for insert to authenticated with check (public.is_admin('admin') and created_by = (select auth.uid()));
create policy "admins update overrides" on public.manual_overrides
  for update to authenticated using (public.is_admin('admin')) with check (public.is_admin('admin'));
create policy "admins delete overrides" on public.manual_overrides
  for delete to authenticated using (public.is_admin('super_admin'));

create policy "admins read audit logs" on public.admin_audit_logs
  for select to authenticated using (public.is_admin('viewer'));

revoke all on table public.admin_users, public.user_data_reports,
  public.user_data_report_history, public.error_groups, public.error_events,
  public.sync_runs, public.sync_run_items, public.manual_overrides,
  public.admin_audit_logs from public, anon;

grant select, insert, update, delete on table public.admin_users to authenticated;
grant select, insert, update on table public.user_data_reports to authenticated;
grant select on table public.user_data_report_history to authenticated;
grant select, update on table public.error_groups to authenticated;
grant select on table public.error_events to authenticated;
grant select, insert, update on table public.sync_runs to authenticated;
grant select on table public.sync_run_items to authenticated;
grant select, insert, update, delete on table public.manual_overrides to authenticated;
grant select on table public.admin_audit_logs to authenticated;

grant all on table public.admin_users, public.user_data_reports,
  public.user_data_report_history, public.error_groups, public.error_events,
  public.sync_runs, public.sync_run_items, public.manual_overrides,
  public.admin_audit_logs to service_role;
grant usage, select on sequence public.user_data_report_history_id_seq,
  public.sync_run_items_id_seq, public.admin_audit_logs_id_seq to service_role;

-- Bootstrap example (run once with the service role after the Auth user exists):
-- insert into public.admin_users (user_id, role, display_name)
-- values ('AUTH_USER_UUID', 'super_admin', '킥온 운영자');

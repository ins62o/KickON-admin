-- KICKON Data Center: APNs delivery observability.
-- Apply after 202609050003. The existing push function remains operational
-- without this table; once integrated it records one aggregate row per run.

create table public.push_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid,
  provider text not null default 'apns' check (provider in ('apns')),
  status text not null check (status in ('succeeded', 'partial', 'failed')),
  targeted_count integer not null default 0 check (targeted_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  removed_token_count integer not null default 0 check (removed_token_count >= 0),
  delivered_development integer not null default 0 check (delivered_development >= 0),
  delivered_production integer not null default 0 check (delivered_production >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text check (error_code is null or char_length(error_code) between 1 and 100),
  error_message text check (error_message is null or char_length(error_message) between 1 and 1000),
  request_id text check (request_id is null or char_length(request_id) between 1 and 200),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (delivered_count + failed_count + removed_token_count <= targeted_count),
  check (delivered_development + delivered_production = delivered_count)
);

create index push_delivery_runs_completed_idx
  on public.push_delivery_runs (completed_at desc);
create index push_delivery_runs_status_completed_idx
  on public.push_delivery_runs (status, completed_at desc);
create unique index push_delivery_runs_request_idx
  on public.push_delivery_runs (request_id)
  where request_id is not null;

comment on table public.push_delivery_runs is
  'Push Edge Function의 알림 단위 집계 결과. 디바이스 토큰, 사용자 ID, APNs 응답 본문은 저장하지 않는다.';

create or replace function public.record_push_delivery_run(
  p_notification_id uuid,
  p_targeted_count integer,
  p_delivered_count integer,
  p_failed_count integer,
  p_removed_token_count integer,
  p_delivered_development integer,
  p_delivered_production integer,
  p_duration_ms integer,
  p_error_code text,
  p_error_message text,
  p_request_id text,
  p_completed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run uuid;
  safe_targeted integer := greatest(coalesce(p_targeted_count, 0), 0);
  safe_delivered integer := greatest(coalesce(p_delivered_count, 0), 0);
  safe_failed integer := greatest(coalesce(p_failed_count, 0), 0);
  safe_removed integer := greatest(coalesce(p_removed_token_count, 0), 0);
  safe_development integer := greatest(coalesce(p_delivered_development, 0), 0);
  safe_production integer := greatest(coalesce(p_delivered_production, 0), 0);
  safe_error_code text := nullif(left(trim(coalesce(p_error_code, '')), 100), '');
  safe_error_message text := nullif(left(trim(coalesce(p_error_message, '')), 1000), '');
  safe_request_id text := nullif(left(trim(coalesce(p_request_id, '')), 200), '');
  safe_completed_at timestamptz := greatest(
    now() - interval '90 days',
    least(coalesce(p_completed_at, now()), now() + interval '5 minutes')
  );
  derived_status text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if safe_delivered + safe_failed + safe_removed > safe_targeted
    or safe_development + safe_production <> safe_delivered
    or p_duration_ms < 0 then
    raise exception 'INVALID_PUSH_DELIVERY_COUNTS';
  end if;

  derived_status := case
    when (safe_error_code is not null or safe_failed > 0) and safe_delivered = 0 then 'failed'
    when safe_failed > 0 or safe_error_code is not null then 'partial'
    else 'succeeded'
  end;

  insert into public.push_delivery_runs (
    notification_id, status, targeted_count, delivered_count, failed_count,
    removed_token_count, delivered_development, delivered_production,
    duration_ms, error_code, error_message, request_id, completed_at
  ) values (
    p_notification_id, derived_status, safe_targeted, safe_delivered, safe_failed,
    safe_removed, safe_development, safe_production,
    p_duration_ms, safe_error_code, safe_error_message, safe_request_id, safe_completed_at
  )
  on conflict (request_id) where request_id is not null do update set
    notification_id = excluded.notification_id,
    status = excluded.status,
    targeted_count = excluded.targeted_count,
    delivered_count = excluded.delivered_count,
    failed_count = excluded.failed_count,
    removed_token_count = excluded.removed_token_count,
    delivered_development = excluded.delivered_development,
    delivered_production = excluded.delivered_production,
    duration_ms = excluded.duration_ms,
    error_code = excluded.error_code,
    error_message = excluded.error_message,
    completed_at = greatest(public.push_delivery_runs.completed_at, excluded.completed_at)
  returning id into target_run;

  return target_run;
end;
$$;

revoke all on function public.record_push_delivery_run(
  uuid, integer, integer, integer, integer, integer, integer,
  integer, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_push_delivery_run(
  uuid, integer, integer, integer, integer, integer, integer,
  integer, text, text, text, timestamptz
) to service_role;

create or replace function public.get_admin_push_delivery_health()
returns table (
  latest_status text,
  latest_completed_at timestamptz,
  latest_error_code text,
  run_count_24h bigint,
  targeted_count_24h bigint,
  delivered_count_24h bigint,
  failed_count_24h bigint,
  removed_token_count_24h bigint
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
    (select run.status from public.push_delivery_runs run
      where run.completed_at >= now() - interval '30 days'
      order by run.completed_at desc limit 1),
    (select run.completed_at from public.push_delivery_runs run
      where run.completed_at >= now() - interval '30 days'
      order by run.completed_at desc limit 1),
    (select run.error_code from public.push_delivery_runs run
      where run.completed_at >= now() - interval '30 days'
      order by run.completed_at desc limit 1),
    count(*) filter (where run.completed_at >= now() - interval '24 hours'),
    coalesce(sum(run.targeted_count) filter (where run.completed_at >= now() - interval '24 hours'), 0),
    coalesce(sum(run.delivered_count) filter (where run.completed_at >= now() - interval '24 hours'), 0),
    coalesce(sum(run.failed_count) filter (where run.completed_at >= now() - interval '24 hours'), 0),
    coalesce(sum(run.removed_token_count) filter (where run.completed_at >= now() - interval '24 hours'), 0)
  from public.push_delivery_runs run
  where run.completed_at >= now() - interval '30 days';
end;
$$;

revoke all on function public.get_admin_push_delivery_health() from public, anon;
grant execute on function public.get_admin_push_delivery_health() to authenticated, service_role;

alter table public.push_delivery_runs enable row level security;
create policy "admins read push delivery runs" on public.push_delivery_runs
  for select to authenticated using (public.is_admin('viewer'));

revoke all on table public.push_delivery_runs from public, anon;
grant select on table public.push_delivery_runs to authenticated;
grant all on table public.push_delivery_runs to service_role;

begin;

-- 관리자 기본 계약이 적용된 프로젝트에 동기화 실행 기록만 추가합니다.
do $$
begin
  if to_regclass('public.admin_users') is null
    or to_regprocedure('public.admin_has_capability(text)') is null
  then
    raise exception 'ADMIN_BASE_SCHEMA_REQUIRED';
  end if;

  if to_regtype('public.sync_run_status') is null then
    create type public.sync_run_status as enum (
      'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'
    );
  end if;

  if exists (
    select 1
    from unnest(array[
      'queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'
    ]) as required_status(value)
    where not exists (
      select 1
      from pg_enum enum_value
      where enum_value.enumtypid = 'public.sync_run_status'::regtype
        and enum_value.enumlabel::text = required_status.value
    )
  ) then
    raise exception 'SYNC_RUN_STATUS_INCOMPATIBLE';
  end if;
end
$$;

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  target_type text,
  target_id text,
  trigger_type text not null check (
    trigger_type in ('cron', 'manual', 'webhook', 'retry', 'system')
  ),
  environment text not null check (
    environment in ('development', 'production')
  ),
  status public.sync_run_status not null default 'queued',
  requested_by uuid references public.admin_users(user_id) on delete set null,
  reason text,
  started_at timestamptz,
  finished_at timestamptz,
  inserted_count integer check (
    inserted_count is null or inserted_count >= 0
  ),
  updated_count integer check (
    updated_count is null or updated_count >= 0
  ),
  skipped_count integer check (
    skipped_count is null or skipped_count >= 0
  ),
  failed_count integer check (
    failed_count is null or failed_count >= 0
  ),
  provider_request_count integer check (
    provider_request_count is null or provider_request_count >= 0
  ),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sync_runs
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists job_key text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists trigger_type text,
  add column if not exists environment text,
  add column if not exists status public.sync_run_status default 'queued',
  add column if not exists requested_by uuid references public.admin_users(user_id) on delete set null,
  add column if not exists reason text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists inserted_count integer,
  add column if not exists updated_count integer,
  add column if not exists skipped_count integer,
  add column if not exists failed_count integer,
  add column if not exists provider_request_count integer,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists metadata jsonb not null default '{}',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists sync_runs_job_created_idx
  on public.sync_runs (job_key, created_at desc);
create index if not exists sync_runs_status_created_idx
  on public.sync_runs (status, created_at desc);

create or replace function public.touch_sync_run_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_runs_set_updated_at on public.sync_runs;
create trigger sync_runs_set_updated_at
  before update on public.sync_runs
  for each row execute function public.touch_sync_run_updated_at();

-- 감사 로그 스키마가 먼저 적용된 경우 수동 실행 기록을 연결합니다.
do $$
begin
  if to_regprocedure('public.record_admin_audit_log()') is not null
    and not exists (
      select 1
      from pg_trigger trigger_record
      join pg_proc trigger_function
        on trigger_function.oid = trigger_record.tgfoid
      where trigger_record.tgrelid = 'public.sync_runs'::regclass
        and not trigger_record.tgisinternal
        and trigger_function.proname in (
          'record_admin_audit_log', 'data_center_record_table_audit'
        )
    )
  then
    create trigger sync_runs_audit
      after insert on public.sync_runs
      for each row execute function public.record_admin_audit_log();
  end if;
end
$$;

alter table public.sync_runs enable row level security;

drop policy if exists "data center operators read sync runs"
  on public.sync_runs;
drop policy if exists "data center operators create sync runs"
  on public.sync_runs;
drop policy if exists "data center operators update sync runs"
  on public.sync_runs;

create policy "data center operators read sync runs"
  on public.sync_runs for select to authenticated
  using (
    public.admin_has_capability('sync.read')
    or public.admin_has_capability('system.read')
  );

create policy "data center operators create sync runs"
  on public.sync_runs for insert to authenticated
  with check (
    public.admin_has_capability('sync.run')
    and requested_by = (select auth.uid())
  );

create policy "data center operators update sync runs"
  on public.sync_runs for update to authenticated
  using (public.admin_has_capability('sync.run'))
  with check (public.admin_has_capability('sync.run'));

revoke all on table public.sync_runs from public, anon;
grant select, insert, update on table public.sync_runs to authenticated;
grant all on table public.sync_runs to service_role;

revoke all on function public.touch_sync_run_updated_at()
  from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

select
  to_regclass('public.sync_runs') is not null as sync_runs_table_ready,
  has_table_privilege(
    'authenticated', 'public.sync_runs', 'insert'
  ) as authenticated_insert_ready,
  has_table_privilege(
    'authenticated', 'public.sync_runs', 'update'
  ) as authenticated_update_ready;

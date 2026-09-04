-- KickON Data Center: forward-only administration contracts.
--
-- This migration deliberately keeps the mobile application's existing tables,
-- grants, and permissive policies in place.  Additional RESTRICTIVE policies
-- provide the moderation/suspension guardrails without depending on policy
-- replacement order.  Apply only after reconciling the shared migration
-- history of the mobile and admin repositories.

-- ---------------------------------------------------------------------------
-- Administrator membership, capabilities, and sanitized audit writes
-- ---------------------------------------------------------------------------

-- These columns are referenced by the restrictive community policies below;
-- add them before defining any function or policy that mentions them.
alter table public.posts
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.comments
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.fixture_cheer_messages
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

do $$
begin
  if to_regtype('public.admin_role') is null then
    create type public.admin_role as enum (
      'viewer', 'operator', 'admin', 'super_admin',
      'support', 'moderator', 'data_editor'
    );
  end if;
end
$$;

alter type public.admin_role add value if not exists 'support';
alter type public.admin_role add value if not exists 'moderator';
alter type public.admin_role add value if not exists 'data_editor';

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null default 'viewer',
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

alter table public.admin_users
  add column if not exists role public.admin_role not null default 'viewer',
  add column if not exists display_name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.admin_role_rank(role_to_rank public.admin_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case role_to_rank::text
    when 'viewer' then 10
    when 'operator' then 20
    when 'admin' then 30
    when 'super_admin' then 40
    -- data_editor remains compatible with the existing football override RPCs,
    -- which currently require the legacy admin rank.  This also inherits every
    -- other still-deployed is_admin('admin') guard, so the linked migration/RPC
    -- inventory must be audited before applying.  New RPCs below use explicit
    -- capabilities instead of this compatibility hierarchy.
    when 'data_editor' then 30
    else 0
  end;
$$;

create or replace function public.is_admin(
  required_role public.admin_role default 'viewer'
)
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
      and public.admin_role_rank(administrator.role)
        >= public.admin_role_rank(required_role)
  );
$$;

create or replace function public.admin_has_capability(required_capability text)
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
      and (
        administrator.role::text = 'super_admin'
        or (administrator.role::text = 'support' and required_capability in (
          'dashboard.read', 'users.read', 'support.read', 'support.write',
          'system.read', 'audit.read'
        ))
        or (administrator.role::text = 'moderator' and required_capability in (
          'dashboard.read', 'moderation.read', 'moderation.write',
          'users.read', 'users.moderate', 'system.read', 'audit.read'
        ))
        or (administrator.role::text = 'data_editor' and required_capability in (
          'dashboard.read', 'data.read', 'data.write', 'football.read',
          'football.write', 'sync.read', 'sync.run', 'football.sync',
          'system.read', 'storage.read', 'audit.read'
        ))
        -- Legacy roles are retained until all existing operator screens have
        -- moved from ordinal checks to explicit capabilities.
        or (administrator.role::text = 'viewer' and required_capability in (
          'dashboard.read', 'users.read', 'support.read', 'moderation.read',
          'data.read', 'football.read', 'sync.read', 'system.read',
          'storage.read', 'audit.read'
        ))
        or (administrator.role::text in ('operator', 'admin')
          and required_capability in (
            'dashboard.read', 'users.read', 'users.moderate', 'support.read',
            'support.write', 'moderation.read', 'moderation.write',
            'data.read', 'data.write', 'football.read', 'football.write',
            'sync.read', 'sync.run', 'football.sync', 'system.read',
            'storage.read', 'audit.read'
          ))
      )
  );
$$;

revoke all on function public.admin_role_rank(public.admin_role)
  from public, anon;
revoke all on function public.is_admin(public.admin_role)
  from public, anon;
revoke all on function public.admin_has_capability(text)
  from public, anon;
grant execute on function public.admin_role_rank(public.admin_role)
  to authenticated, service_role;
grant execute on function public.is_admin(public.admin_role)
  to authenticated, service_role;
grant execute on function public.admin_has_capability(text)
  to authenticated, service_role;

create table if not exists public.admin_audit_logs (
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

alter table public.admin_audit_logs
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists actor_role public.admin_role,
  add column if not exists action text,
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists reason text,
  add column if not exists before_value jsonb,
  add column if not exists after_value jsonb,
  add column if not exists request_id text,
  add column if not exists ip_hash text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);
create index if not exists admin_audit_logs_actor_idx
  on public.admin_audit_logs (actor_id, created_at desc);

create or replace function public.data_center_write_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_before_data jsonb,
  p_after_data jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  -- CURRENT_ROLE은 PostgreSQL 예약 표현식이므로 다른 변수명을 사용합니다.
  actor_admin_role public.admin_role;
begin
  select administrator.role
  into actor_admin_role
  from public.admin_users administrator
  where administrator.user_id = current_actor
    and administrator.is_active;

  insert into public.admin_audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    before_value, after_value
  ) values (
    current_actor,
    actor_admin_role,
    left(coalesce(nullif(trim(p_action), ''), 'UNKNOWN'), 120),
    left(coalesce(nullif(trim(p_target_type), ''), 'unknown'), 120),
    nullif(left(coalesce(p_target_id, ''), 300), ''),
    nullif(left(trim(coalesce(p_reason, '')), 1000), ''),
    p_before_data,
    p_after_data
  );
end;
$$;

revoke all on function public.data_center_write_audit(
  text, text, text, jsonb, jsonb, text
) from public, anon, authenticated;

create or replace function public.data_center_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.data_center_touch_updated_at()
  from public, anon, authenticated;

create or replace function public.data_center_audit_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.data_center_write_audit(
    'ADMIN_MEMBERSHIP_' || tg_op,
    'admin_user',
    coalesce(new.user_id, old.user_id)::text,
    case when tg_op = 'INSERT' then null else jsonb_build_object(
      'role', old.role::text,
      'active', old.is_active,
      'displayName', old.display_name
    ) end,
    case when tg_op = 'DELETE' then null else jsonb_build_object(
      'role', new.role::text,
      'active', new.is_active,
      'displayName', new.display_name
    ) end,
    null
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.data_center_audit_admin_membership()
  from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.admin_users'::regclass
      and not tgisinternal
      and tgname in ('admin_users_audit', 'data_center_admin_users_audit')
  ) then
    create trigger data_center_admin_users_audit
      after insert or update or delete on public.admin_users
      for each row execute function public.data_center_audit_admin_membership();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.admin_users'::regclass
      and not tgisinternal
      and tgname in ('admin_users_set_updated_at', 'data_center_admin_users_updated_at')
  ) then
    create trigger data_center_admin_users_updated_at
      before update on public.admin_users
      for each row execute function public.data_center_touch_updated_at();
  end if;
end
$$;

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "data center users read own admin membership"
  on public.admin_users;
create policy "data center users read own admin membership"
  on public.admin_users for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.admin_has_capability('admins.manage')
  );

drop policy if exists "data center super admins create memberships"
  on public.admin_users;
create policy "data center super admins create memberships"
  on public.admin_users for insert to authenticated
  with check (public.admin_has_capability('admins.manage'));

drop policy if exists "data center super admins update memberships"
  on public.admin_users;
create policy "data center super admins update memberships"
  on public.admin_users for update to authenticated
  using (public.admin_has_capability('admins.manage'))
  with check (public.admin_has_capability('admins.manage'));

drop policy if exists "data center super admins delete memberships"
  on public.admin_users;
create policy "data center super admins delete memberships"
  on public.admin_users for delete to authenticated
  using (public.admin_has_capability('admins.manage'));

drop policy if exists "data center super admins read audit logs"
  on public.admin_audit_logs;
create policy "data center super admins read audit logs"
  on public.admin_audit_logs for select to authenticated
  using (
    public.admin_has_capability('audit.read')
  );

revoke all on table public.admin_users, public.admin_audit_logs
  from public, anon;
grant select, insert, update, delete on table public.admin_users
  to authenticated;
grant select on table public.admin_audit_logs to authenticated;
grant all on table public.admin_users, public.admin_audit_logs to service_role;

-- Specialized roles have rank zero in the legacy ordinal model.  Add only
-- read policies for optional system-health tables; their existing policies
-- and write contracts remain untouched.
do $$
begin
  if to_regclass('public.error_groups') is not null then
    execute 'drop policy if exists "data center system readers read error groups" on public.error_groups';
    execute 'create policy "data center system readers read error groups" on public.error_groups for select to authenticated using (public.admin_has_capability(''system.read''))';
    grant select on table public.error_groups to authenticated;
  end if;
  if to_regclass('public.error_events') is not null then
    execute 'drop policy if exists "data center system readers read error events" on public.error_events';
    execute 'create policy "data center system readers read error events" on public.error_events for select to authenticated using (public.admin_has_capability(''system.read''))';
    grant select on table public.error_events to authenticated;
  end if;
  if to_regclass('public.sync_runs') is not null then
    execute 'drop policy if exists "data center system readers read sync runs" on public.sync_runs';
    execute 'create policy "data center system readers read sync runs" on public.sync_runs for select to authenticated using (public.admin_has_capability(''system.read'') or public.admin_has_capability(''sync.read''))';
    grant select on table public.sync_runs to authenticated;
  end if;
  if to_regclass('public.sync_run_items') is not null then
    execute 'drop policy if exists "data center system readers read sync run items" on public.sync_run_items';
    execute 'create policy "data center system readers read sync run items" on public.sync_run_items for select to authenticated using (public.admin_has_capability(''system.read'') or public.admin_has_capability(''sync.read''))';
    grant select on table public.sync_run_items to authenticated;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Global dashboard aggregates.  Base-table RLS intentionally remains narrow;
-- every dashboard role receives only counts and the bounded operational rows
-- already rendered by the console, never unrestricted source rows.
-- ---------------------------------------------------------------------------

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);
create index if not exists profiles_team_id_idx
  on public.profiles (team_id);

create or replace function public.admin_get_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today_start timestamptz;
  v_seven_day_start timestamptz;
  v_month_start timestamptz;
  v_twenty_four_hour_start timestamptz := v_now - interval '24 hours';
  v_include_system_details boolean;
  v_result jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('dashboard.read')
    )
  then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;
  v_include_system_details := coalesce((select auth.role()), '') = 'service_role'
    or public.admin_has_capability('system.read');

  v_today_start := date_trunc(
    'day', v_now at time zone 'Asia/Seoul'
  ) at time zone 'Asia/Seoul';
  v_seven_day_start := v_today_start - interval '6 days';
  v_month_start := date_trunc(
    'month', v_now at time zone 'Asia/Seoul'
  ) at time zone 'Asia/Seoul';

  with team_counts as (
    select
      team.id as team_id,
      team.name as team_name,
      count(profile.id)::bigint as member_count
    from public.teams team
    left join public.profiles profile on profile.team_id = team.id
    group by team.id, team.name

    union all

    select
      null::text as team_id,
      '응원 팀 미선택'::text as team_name,
      count(*)::bigint as member_count
    from public.profiles profile
    where profile.team_id is null
  ),
  failed_rows as (
    select
      run.id,
      run.job_key,
      run.status::text as status,
      run.failed_count,
      run.error_code,
      run.error_message,
      run.started_at,
      run.finished_at,
      run.created_at
    from public.sync_runs run
    where run.created_at >= v_twenty_four_hour_start
      and run.status in ('failed', 'partial')
      and (
        run.status = 'failed'
        or coalesce(run.failed_count, 0) > 0
        or nullif(run.error_code, '') is not null
        or nullif(run.error_message, '') is not null
      )
  )
  select jsonb_build_object(
    'generatedAt', v_now,
    'totalProfiles', (select count(*) from public.profiles),
    'newToday', (
      select count(*) from public.profiles profile
      where profile.created_at >= v_today_start
    ),
    'new7d', (
      select count(*) from public.profiles profile
      where profile.created_at >= v_seven_day_start
    ),
    'newMonth', (
      select count(*) from public.profiles profile
      where profile.created_at >= v_month_start
    ),
    'teamDistribution', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'teamId', team_count.team_id,
          'teamName', team_count.team_name,
          'memberCount', team_count.member_count
        )
        order by team_count.member_count desc, team_count.team_name
      )
      from team_counts team_count
    ), '[]'::jsonb),
    'posts', (select count(*) from public.posts),
    'comments', (select count(*) from public.comments),
    'attendances', (select count(*) from public.attendances),
    'openInquiries', (
      select count(*) from public.support_inquiries inquiry
      where inquiry.status in ('RECEIVED', 'IN_PROGRESS')
    ),
    'openReports', (
      select count(*) from public.content_reports report
      where report.status in ('OPEN', 'REVIEWED')
    ),
    'failedSyncCount', (select count(*) from failed_rows),
    'recentFailedSyncs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', recent.id,
          'jobKey', recent.job_key,
          'status', recent.status,
          'failedCount', recent.failed_count,
          'errorCode', case
            when v_include_system_details then recent.error_code
            else null
          end,
          'errorMessage', case
            when v_include_system_details then recent.error_message
            else null
          end,
          'startedAt', recent.started_at,
          'finishedAt', recent.finished_at,
          'createdAt', recent.created_at
        ) order by recent.created_at desc, recent.id desc
      )
      from (
        select * from failed_rows
        order by created_at desc, id desc
        limit 10
      ) recent
    ), '[]'::jsonb),
    'syncFreshness', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'syncKey', state.sync_key,
          'lastAttemptedAt', state.last_attempted_at,
          'lastSucceededAt', state.last_succeeded_at,
          'lastError', state.last_error
        ) order by state.sync_key
      )
      from public.football_sync_state state
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_get_dashboard_metrics()
  from public, anon;
grant execute on function public.admin_get_dashboard_metrics()
  to authenticated, service_role;

comment on function public.admin_get_dashboard_metrics() is
  'Returns global dashboard counts, the latest ten failed syncs from 24 hours, and football sync freshness after a dashboard.read capability check.';

-- ---------------------------------------------------------------------------
-- Support inquiries.  The existing user_id -> profiles ON DELETE CASCADE is
-- intentionally untouched, and private notes inherit that deletion through
-- their inquiry foreign key.
-- ---------------------------------------------------------------------------

alter table public.support_inquiries
  add column if not exists answer_content text,
  add column if not exists answered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.support_inquiries'::regclass
      and conname = 'support_inquiries_answer_content_check'
  ) then
    alter table public.support_inquiries
      add constraint support_inquiries_answer_content_check
      check (
        answer_content is null
        or char_length(trim(answer_content)) between 1 and 4000
      );
  end if;
end
$$;

create table if not exists public.support_inquiry_admin_notes (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.support_inquiries(id) on delete cascade,
  note text not null check (char_length(trim(note)) between 1 and 4000),
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists support_inquiry_admin_notes_inquiry_idx
  on public.support_inquiry_admin_notes (inquiry_id, created_at desc);

create table if not exists public.support_inquiry_admin_actions (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.support_inquiries(id) on delete cascade,
  status text not null check (
    status in ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')
  ),
  answer_touched boolean not null default false,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  acted_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists support_inquiry_admin_actions_inquiry_idx
  on public.support_inquiry_admin_actions (inquiry_id, created_at desc);

drop trigger if exists data_center_support_inquiries_updated_at
  on public.support_inquiries;
create trigger data_center_support_inquiries_updated_at
  before update on public.support_inquiries
  for each row execute function public.data_center_touch_updated_at();

alter table public.support_inquiry_admin_notes enable row level security;
alter table public.support_inquiry_admin_actions enable row level security;

drop policy if exists "data center support reads inquiries"
  on public.support_inquiries;
create policy "data center support reads inquiries"
  on public.support_inquiries for select to authenticated
  using (public.admin_has_capability('support.read'));

drop policy if exists "data center support reads inquiry notes"
  on public.support_inquiry_admin_notes;
create policy "data center support reads inquiry notes"
  on public.support_inquiry_admin_notes for select to authenticated
  using (public.admin_has_capability('support.read'));

drop policy if exists "data center support reads inquiry actions"
  on public.support_inquiry_admin_actions;
create policy "data center support reads inquiry actions"
  on public.support_inquiry_admin_actions for select to authenticated
  using (public.admin_has_capability('support.read'));

revoke all on table public.support_inquiry_admin_notes,
  public.support_inquiry_admin_actions
  from public, anon, authenticated;
grant select on table public.support_inquiry_admin_notes,
  public.support_inquiry_admin_actions to authenticated;
grant all on table public.support_inquiry_admin_notes,
  public.support_inquiry_admin_actions to service_role;
grant select on table public.support_inquiries to authenticated;

create or replace function public.admin_get_support_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.admin_has_capability('support.read') then
    raise exception 'SUPPORT_PERMISSION_REQUIRED';
  end if;

  select jsonb_build_object(
    'id', inquiry.id,
    'userId', inquiry.user_id,
    'category', inquiry.category,
    'subject', inquiry.subject,
    'content', inquiry.content,
    'status', inquiry.status,
    'answerContent', inquiry.answer_content,
    'answeredBy', (
      select action.acted_by
      from public.support_inquiry_admin_actions action
      where action.inquiry_id = inquiry.id
        and action.answer_touched
      order by action.created_at desc
      limit 1
    ),
    'answeredAt', inquiry.answered_at,
    'createdAt', inquiry.created_at,
    'updatedAt', inquiry.updated_at,
    'author', jsonb_build_object(
      'nickname', profile.nickname,
      'teamId', profile.team_id,
      'teamName', team.name
    ),
    'adminNotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', note.id,
        'note', note.note,
        'createdBy', note.created_by,
        'createdAt', note.created_at
      ) order by note.created_at asc)
      from public.support_inquiry_admin_notes note
      where note.inquiry_id = inquiry.id
    ), '[]'::jsonb)
  )
  into result
  from public.support_inquiries inquiry
  join public.profiles profile on profile.id = inquiry.user_id
  left join public.teams team on team.id = profile.team_id
  where inquiry.id = p_inquiry_id;

  if result is null then
    raise exception 'SUPPORT_INQUIRY_NOT_FOUND';
  end if;
  return result;
end;
$$;

create or replace function public.admin_update_support_inquiry(
  p_inquiry_id uuid,
  p_status text,
  p_answer_content text default null,
  p_internal_note text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  before_row public.support_inquiries;
  after_row public.support_inquiries;
  normalized_answer text := nullif(trim(coalesce(p_answer_content, '')), '');
  normalized_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if current_actor is null or not public.admin_has_capability('support.write') then
    raise exception 'SUPPORT_PERMISSION_REQUIRED';
  end if;
  if p_status is null
    or p_status not in ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED') then
    raise exception 'INVALID_SUPPORT_STATUS';
  end if;
  if char_length(normalized_reason) not between 3 and 1000 then
    raise exception 'SUPPORT_REASON_REQUIRED';
  end if;
  if normalized_answer is not null and char_length(normalized_answer) > 4000 then
    raise exception 'SUPPORT_ANSWER_TOO_LONG';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 4000 then
    raise exception 'SUPPORT_NOTE_TOO_LONG';
  end if;

  select * into before_row
  from public.support_inquiries inquiry
  where inquiry.id = p_inquiry_id
  for update;
  if not found then
    raise exception 'SUPPORT_INQUIRY_NOT_FOUND';
  end if;

  if p_status = 'ANSWERED'
    and coalesce(normalized_answer, before_row.answer_content) is null then
    raise exception 'SUPPORT_ANSWER_REQUIRED';
  end if;

  update public.support_inquiries inquiry
  set status = p_status,
      answer_content = coalesce(normalized_answer, inquiry.answer_content),
      answered_at = case
        when p_status = 'ANSWERED' or normalized_answer is not null
          then now()
        else inquiry.answered_at
      end
  where inquiry.id = p_inquiry_id
  returning * into after_row;

  if normalized_note is not null then
    insert into public.support_inquiry_admin_notes (
      inquiry_id, note, created_by
    ) values (
      p_inquiry_id, normalized_note, current_actor
    );
  end if;

  insert into public.support_inquiry_admin_actions (
    inquiry_id, status, answer_touched, reason, acted_by
  ) values (
    p_inquiry_id,
    p_status,
    p_status = 'ANSWERED' or normalized_answer is not null,
    normalized_reason,
    current_actor
  );

  -- Inquiry text and answer text are intentionally not duplicated into the
  -- long-lived audit table, so account deletion continues to remove them.
  perform public.data_center_write_audit(
    'SUPPORT_INQUIRY_UPDATE',
    'support_inquiry',
    p_inquiry_id::text,
    jsonb_build_object(
      'status', before_row.status,
      'hasAnswer', before_row.answer_content is not null,
      'answeredAt', before_row.answered_at
    ),
    jsonb_build_object(
      'status', after_row.status,
      'hasAnswer', after_row.answer_content is not null,
      'answeredAt', after_row.answered_at,
      'noteAdded', normalized_note is not null
    ),
    normalized_reason
  );

  return public.admin_get_support_inquiry(p_inquiry_id);
end;
$$;

create or replace function public.admin_add_support_inquiry_note(
  p_inquiry_id uuid,
  p_note text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_note text := trim(coalesce(p_note, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  created_note uuid;
begin
  if current_actor is null or not public.admin_has_capability('support.write') then
    raise exception 'SUPPORT_PERMISSION_REQUIRED';
  end if;
  if char_length(normalized_note) not between 1 and 4000 then
    raise exception 'INVALID_SUPPORT_NOTE';
  end if;
  if char_length(normalized_reason) not between 3 and 1000 then
    raise exception 'SUPPORT_REASON_REQUIRED';
  end if;
  if not exists (
    select 1 from public.support_inquiries inquiry where inquiry.id = p_inquiry_id
  ) then
    raise exception 'SUPPORT_INQUIRY_NOT_FOUND';
  end if;

  insert into public.support_inquiry_admin_notes (
    inquiry_id, note, created_by
  ) values (
    p_inquiry_id, normalized_note, current_actor
  ) returning id into created_note;

  perform public.data_center_write_audit(
    'SUPPORT_INQUIRY_NOTE_ADD',
    'support_inquiry',
    p_inquiry_id::text,
    null,
    jsonb_build_object('noteId', created_note),
    normalized_reason
  );
  return created_note;
end;
$$;

revoke all on function public.admin_get_support_inquiry(uuid)
  from public, anon;
revoke all on function public.admin_update_support_inquiry(
  uuid, text, text, text, text
) from public, anon;
revoke all on function public.admin_add_support_inquiry_note(uuid, text, text)
  from public, anon;
grant execute on function public.admin_get_support_inquiry(uuid)
  to authenticated;
grant execute on function public.admin_update_support_inquiry(
  uuid, text, text, text, text
) to authenticated;
grant execute on function public.admin_add_support_inquiry_note(uuid, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- User warnings and temporary community suspensions
-- ---------------------------------------------------------------------------

create table if not exists public.user_moderation_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  suspended_until timestamptz,
  suspension_reason text,
  suspended_by uuid references public.admin_users(user_id) on delete set null,
  suspended_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_moderation_states_suspension_check check (
    (suspended_until is null and suspension_reason is null and suspended_at is null)
    or (
      suspended_until is not null
      and suspension_reason is not null
      and char_length(trim(suspension_reason)) between 3 and 1000
      and suspended_at is not null
    )
  )
);

create table if not exists public.user_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('WARN', 'SUSPEND', 'UNSUSPEND')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  suspended_until timestamptz,
  content_report_id uuid references public.content_reports(id) on delete set null,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_moderation_actions_expiry_check check (
    (action = 'SUSPEND' and suspended_until is not null)
    or (action <> 'SUSPEND' and suspended_until is null)
  )
);

create index if not exists user_moderation_states_suspended_idx
  on public.user_moderation_states (suspended_until)
  where suspended_until is not null;
create index if not exists user_moderation_actions_user_idx
  on public.user_moderation_actions (user_id, created_at desc);
create index if not exists user_moderation_actions_report_idx
  on public.user_moderation_actions (content_report_id)
  where content_report_id is not null;

drop trigger if exists data_center_user_moderation_states_updated_at
  on public.user_moderation_states;
create trigger data_center_user_moderation_states_updated_at
  before update on public.user_moderation_states
  for each row execute function public.data_center_touch_updated_at();

alter table public.user_moderation_states enable row level security;
alter table public.user_moderation_actions enable row level security;

drop policy if exists "data center moderators read user states"
  on public.user_moderation_states;
create policy "data center moderators read user states"
  on public.user_moderation_states for select to authenticated
  using (public.admin_has_capability('users.read'));

drop policy if exists "data center moderators read user actions"
  on public.user_moderation_actions;
create policy "data center moderators read user actions"
  on public.user_moderation_actions for select to authenticated
  using (public.admin_has_capability('users.read'));

revoke all on table public.user_moderation_states,
  public.user_moderation_actions from public, anon, authenticated;
grant select on table public.user_moderation_states,
  public.user_moderation_actions to authenticated;
grant all on table public.user_moderation_states,
  public.user_moderation_actions to service_role;

create or replace function public.can_current_user_write_community()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid())
    )
    and not exists (
      select 1
      from public.user_moderation_states state
      where state.user_id = (select auth.uid())
        and state.suspended_until > now()
    );
$$;

revoke all on function public.can_current_user_write_community()
  from public, anon;
grant execute on function public.can_current_user_write_community()
  to authenticated;

create or replace function public.data_center_enforce_community_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Provider and trusted backend writes are unaffected.  Calls made by a
  -- signed-in mobile user, including SECURITY DEFINER cheer RPCs, retain the
  -- authenticated JWT role and are rejected while the suspension is active.
  if coalesce((select auth.role()), '') = 'authenticated'
    and not public.admin_has_capability('moderation.write')
    and (tg_op <> 'DELETE' or pg_trigger_depth() = 1)
    and not public.can_current_user_write_community() then
    raise exception 'COMMUNITY_SUSPENDED';
  end if;
  if coalesce((select auth.role()), '') = 'authenticated'
    and not public.admin_has_capability('moderation.write')
    and pg_trigger_depth() = 1
    and tg_op = 'DELETE' and tg_table_name = 'posts' and exists (
    select 1 from public.content_reports report
    where report.post_id = old.id and report.status in ('OPEN', 'REVIEWED')
  ) then
    raise exception 'REPORTED_CONTENT_DELETE_BLOCKED';
  end if;
  if coalesce((select auth.role()), '') = 'authenticated'
    and not public.admin_has_capability('moderation.write')
    and pg_trigger_depth() = 1
    and tg_op = 'DELETE' and tg_table_name = 'comments' and exists (
    select 1 from public.content_reports report
    where report.comment_id = old.id and report.status in ('OPEN', 'REVIEWED')
  ) then
    raise exception 'REPORTED_CONTENT_DELETE_BLOCKED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.data_center_enforce_community_suspension()
  from public, anon, authenticated;

drop trigger if exists data_center_posts_suspension_guard on public.posts;
create trigger data_center_posts_suspension_guard
  before insert or update or delete on public.posts
  for each row execute function public.data_center_enforce_community_suspension();

drop trigger if exists data_center_comments_suspension_guard on public.comments;
create trigger data_center_comments_suspension_guard
  before insert or update or delete on public.comments
  for each row execute function public.data_center_enforce_community_suspension();

drop trigger if exists data_center_post_likes_suspension_guard on public.post_likes;
create trigger data_center_post_likes_suspension_guard
  before insert or delete on public.post_likes
  for each row execute function public.data_center_enforce_community_suspension();

drop trigger if exists data_center_fixture_cheers_suspension_guard
  on public.fixture_cheer_messages;
create trigger data_center_fixture_cheers_suspension_guard
  before insert on public.fixture_cheer_messages
  for each row execute function public.data_center_enforce_community_suspension();

-- These are additive RESTRICTIVE policies.  The verified mobile policy names
-- remain untouched: "users create own posts", "users update own posts",
-- "users create comments on accessible posts", "users like accessible posts",
-- and "users upload own post images".
drop policy if exists "data center active users create posts" on public.posts;
create policy "data center active users create posts"
  on public.posts as restrictive for insert to authenticated
  with check (public.can_current_user_write_community());

drop policy if exists "data center active users update posts" on public.posts;
create policy "data center active users update posts"
  on public.posts as restrictive for update to authenticated
  using (public.can_current_user_write_community())
  with check (public.can_current_user_write_community());

drop policy if exists "data center active users delete posts" on public.posts;
create policy "data center active users delete posts"
  on public.posts as restrictive for delete to authenticated
  using (public.can_current_user_write_community());

drop policy if exists "data center active users create comments"
  on public.comments;
create policy "data center active users create comments"
  on public.comments as restrictive for insert to authenticated
  with check (
    public.can_current_user_write_community()
    and exists (
      select 1 from public.posts parent_post
      where parent_post.id = comments.post_id
        and parent_post.moderation_status = 'VISIBLE'
    )
  );

drop policy if exists "data center active users delete comments"
  on public.comments;
create policy "data center active users delete comments"
  on public.comments as restrictive for delete to authenticated
  using (public.can_current_user_write_community());

drop policy if exists "data center active users create likes"
  on public.post_likes;
create policy "data center active users create likes"
  on public.post_likes as restrictive for insert to authenticated
  with check (public.can_current_user_write_community());

drop policy if exists "data center active users delete likes"
  on public.post_likes;
create policy "data center active users delete likes"
  on public.post_likes as restrictive for delete to authenticated
  using (public.can_current_user_write_community());

drop policy if exists "data center active users upload post images"
  on storage.objects;
create policy "data center active users upload post images"
  on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'post-images'
    or public.can_current_user_write_community()
  );

create or replace function public.admin_get_users(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  nickname text,
  team_id text,
  team_name text,
  joined_at timestamptz,
  post_count bigint,
  comment_count bigint,
  attendance_count bigint,
  received_report_count bigint,
  recent_activity_at timestamptz,
  account_status text,
  suspended_until timestamptz,
  warning_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_query text := lower(trim(coalesce(p_query, '')));
  safe_limit integer := least(100, greatest(1, coalesce(p_limit, 50)));
  safe_offset integer := least(100000, greatest(0, coalesce(p_offset, 0)));
begin
  if not public.admin_has_capability('users.read') then
    raise exception 'USER_ADMIN_PERMISSION_REQUIRED';
  end if;

  return query
  select
    profile.id,
    profile.nickname,
    profile.team_id,
    team.name,
    profile.created_at,
    activity.post_count,
    activity.comment_count,
    activity.attendance_count,
    activity.received_report_count,
    activity.recent_activity_at,
    case
      when state.suspended_until > now() then 'SUSPENDED'
      else 'ACTIVE'
    end,
    state.suspended_until,
    activity.warning_count
  from public.profiles profile
  left join public.teams team on team.id = profile.team_id
  left join public.user_moderation_states state on state.user_id = profile.id
  cross join lateral (
    select
      (select count(*) from public.posts post
        where post.author_id = profile.id)::bigint as post_count,
      (select count(*) from public.comments comment
        where comment.user_id = profile.id)::bigint as comment_count,
      (select count(*) from public.attendances attendance
        where attendance.user_id = profile.id)::bigint as attendance_count,
      (select count(*)
        from public.content_reports report
        where exists (
          select 1 from public.posts post
          where post.id = report.post_id and post.author_id = profile.id
        ) or exists (
          select 1 from public.comments comment
          where comment.id = report.comment_id and comment.user_id = profile.id
        ) or exists (
          select 1 from public.fixture_cheer_messages cheer
          where cheer.id = report.cheer_message_id and cheer.user_id = profile.id
        ))::bigint as received_report_count,
      greatest(
        (select max(post.created_at) from public.posts post
          where post.author_id = profile.id),
        (select max(comment.created_at) from public.comments comment
          where comment.user_id = profile.id),
        (select max(attendance.verified_at) from public.attendances attendance
          where attendance.user_id = profile.id),
        (select max(cheer.created_at) from public.fixture_cheer_messages cheer
          where cheer.user_id = profile.id),
        profile.updated_at
      ) as recent_activity_at,
      (select count(*) from public.user_moderation_actions action
        where action.user_id = profile.id and action.action = 'WARN')::bigint
        as warning_count
  ) activity
  where normalized_query = ''
    or lower(profile.id::text) like '%' || normalized_query || '%'
    or lower(profile.nickname) like '%' || normalized_query || '%'
    or lower(coalesce(profile.team_id, '')) like '%' || normalized_query || '%'
    or lower(coalesce(team.name, '')) like '%' || normalized_query || '%'
  order by activity.recent_activity_at desc nulls last, profile.created_at desc
  limit safe_limit offset safe_offset;
end;
$$;

create or replace function public.admin_apply_user_action(
  p_user_id uuid,
  p_action text,
  p_reason text,
  p_suspended_until timestamptz default null,
  p_content_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_action text := upper(trim(coalesce(p_action, '')));
  normalized_reason text := trim(coalesce(p_reason, ''));
  before_state jsonb;
  after_state jsonb;
  created_action uuid;
begin
  if current_actor is null or not public.admin_has_capability('users.moderate') then
    raise exception 'USER_MODERATION_PERMISSION_REQUIRED';
  end if;
  if normalized_action not in ('WARN', 'SUSPEND', 'UNSUSPEND') then
    raise exception 'INVALID_USER_MODERATION_ACTION';
  end if;
  if char_length(normalized_reason) not between 3 and 1000 then
    raise exception 'USER_MODERATION_REASON_REQUIRED';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.admin_users administrator
    where administrator.user_id = p_user_id and administrator.is_active
  ) and not public.admin_has_capability('admins.manage') then
    raise exception 'TARGET_ADMIN_PROTECTED';
  end if;
  if p_content_report_id is not null and not exists (
    select 1 from public.content_reports report
    where report.id = p_content_report_id
  ) then
    raise exception 'CONTENT_REPORT_NOT_FOUND';
  end if;
  if normalized_action = 'SUSPEND' and (
    p_suspended_until is null
    or p_suspended_until <= now()
    or p_suspended_until > now() + interval '365 days'
  ) then
    raise exception 'INVALID_SUSPENSION_WINDOW';
  end if;

  select jsonb_build_object(
    'suspendedUntil', state.suspended_until,
    'suspensionReason', state.suspension_reason
  ) into before_state
  from public.user_moderation_states state
  where state.user_id = p_user_id
  for update;

  if normalized_action = 'SUSPEND' then
    insert into public.user_moderation_states (
      user_id, suspended_until, suspension_reason, suspended_by, suspended_at
    ) values (
      p_user_id, p_suspended_until, normalized_reason, current_actor, now()
    )
    on conflict (user_id) do update set
      suspended_until = excluded.suspended_until,
      suspension_reason = excluded.suspension_reason,
      suspended_by = excluded.suspended_by,
      suspended_at = excluded.suspended_at,
      updated_at = now();
  elsif normalized_action = 'UNSUSPEND' then
    insert into public.user_moderation_states (user_id)
    values (p_user_id)
    on conflict (user_id) do update set
      suspended_until = null,
      suspension_reason = null,
      suspended_by = current_actor,
      suspended_at = null,
      updated_at = now();
  end if;

  insert into public.user_moderation_actions (
    user_id, action, reason, suspended_until, content_report_id, created_by
  ) values (
    p_user_id,
    normalized_action,
    normalized_reason,
    case when normalized_action = 'SUSPEND' then p_suspended_until end,
    p_content_report_id,
    current_actor
  ) returning id into created_action;

  select jsonb_build_object(
    'suspendedUntil', state.suspended_until,
    'suspensionReason', state.suspension_reason
  ) into after_state
  from public.user_moderation_states state
  where state.user_id = p_user_id;

  perform public.data_center_write_audit(
    'USER_' || normalized_action,
    'user',
    p_user_id::text,
    coalesce(before_state, '{}'::jsonb),
    coalesce(after_state, '{}'::jsonb) || jsonb_build_object(
      'actionId', created_action,
      'contentReportId', p_content_report_id
    ),
    normalized_reason
  );

  return jsonb_build_object(
    'actionId', created_action,
    'userId', p_user_id,
    'action', normalized_action,
    'suspendedUntil', case
      when normalized_action = 'SUSPEND' then p_suspended_until
      else null
    end
  );
end;
$$;

revoke all on function public.admin_get_users(text, integer, integer)
  from public, anon;
revoke all on function public.admin_apply_user_action(
  uuid, text, text, timestamptz, uuid
) from public, anon;
grant execute on function public.admin_get_users(text, integer, integer)
  to authenticated;
grant execute on function public.admin_apply_user_action(
  uuid, text, text, timestamptz, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Content reports and reversible visibility moderation
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.comments
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.fixture_cheer_messages
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

do $$
declare
  target_table regclass;
  constraint_name text;
begin
  foreach target_table in array array[
    'public.posts'::regclass,
    'public.comments'::regclass,
    'public.fixture_cheer_messages'::regclass
  ] loop
    constraint_name := replace(target_table::text, '.', '_') || '_moderation_status_check';
    if not exists (
      select 1 from pg_constraint
      where conrelid = target_table and conname = constraint_name
    ) then
      execute format(
        'alter table %s add constraint %I check (moderation_status in (''VISIBLE'', ''HIDDEN''))',
        target_table,
        constraint_name
      );
    end if;
  end loop;
end
$$;

create index if not exists posts_moderation_created_idx
  on public.posts (moderation_status, created_at desc);
create index if not exists comments_moderation_created_idx
  on public.comments (moderation_status, created_at desc);
create index if not exists fixture_cheers_moderation_created_idx
  on public.fixture_cheer_messages (moderation_status, created_at desc);

alter table public.content_reports
  add column if not exists reviewed_by uuid references public.admin_users(user_id) on delete set null,
  add column if not exists resolution_note text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists content_reports_post_target_idx
  on public.content_reports (post_id) where post_id is not null;
create index if not exists content_reports_comment_target_idx
  on public.content_reports (comment_id) where comment_id is not null;
create index if not exists content_reports_cheer_target_idx
  on public.content_reports (cheer_message_id) where cheer_message_id is not null;

drop trigger if exists data_center_content_reports_updated_at
  on public.content_reports;
create trigger data_center_content_reports_updated_at
  before update on public.content_reports
  for each row execute function public.data_center_touch_updated_at();

create table if not exists public.content_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (
    target_type in ('POST', 'COMMENT', 'FIXTURE_CHEER')
  ),
  target_id uuid not null,
  action text not null check (action in ('HIDE', 'RESTORE')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  content_report_id uuid references public.content_reports(id) on delete set null,
  created_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_moderation_actions_target_idx
  on public.content_moderation_actions (target_type, target_id, created_at desc);
create index if not exists content_moderation_actions_report_idx
  on public.content_moderation_actions (content_report_id)
  where content_report_id is not null;

alter table public.content_moderation_actions enable row level security;

drop policy if exists "data center moderators read content reports"
  on public.content_reports;
create policy "data center moderators read content reports"
  on public.content_reports for select to authenticated
  using (public.admin_has_capability('moderation.read'));

drop policy if exists "data center moderators read content actions"
  on public.content_moderation_actions;
create policy "data center moderators read content actions"
  on public.content_moderation_actions for select to authenticated
  using (public.admin_has_capability('moderation.read'));

grant select on table public.content_reports to authenticated;
revoke all on table public.content_moderation_actions
  from public, anon, authenticated;
grant select on table public.content_moderation_actions to authenticated;
grant all on table public.content_moderation_actions to service_role;

-- Moderators need a permissive path to targets from every team.  The
-- role-specific RESTRICTIVE policies below then decide whether hidden rows are
-- visible to that authenticated administrator or only visible mobile rows.
drop policy if exists "data center moderators read all posts" on public.posts;
create policy "data center moderators read all posts"
  on public.posts for select to authenticated
  using (public.admin_has_capability('moderation.read'));

drop policy if exists "data center moderators read all comments"
  on public.comments;
create policy "data center moderators read all comments"
  on public.comments for select to authenticated
  using (public.admin_has_capability('moderation.read'));

-- Existing permissive mobile read policies remain.  PostgreSQL combines these
-- RESTRICTIVE policies with every permissive policy using AND, preventing a
-- hidden row from being fetched directly even when its UUID is known.
drop policy if exists "data center visible posts" on public.posts;
create policy "data center visible posts"
  on public.posts as restrictive for select to anon
  using (moderation_status = 'VISIBLE');
drop policy if exists "data center visible posts authenticated" on public.posts;
create policy "data center visible posts authenticated"
  on public.posts as restrictive for select to authenticated
  using (
    moderation_status = 'VISIBLE'
    or public.admin_has_capability('moderation.read')
  );

drop policy if exists "data center visible comments" on public.comments;
create policy "data center visible comments"
  on public.comments as restrictive for select to anon
  using (
    moderation_status = 'VISIBLE'
    and exists (
      select 1 from public.posts parent_post
      where parent_post.id = comments.post_id
        and parent_post.moderation_status = 'VISIBLE'
    )
  );
drop policy if exists "data center visible comments authenticated"
  on public.comments;
create policy "data center visible comments authenticated"
  on public.comments as restrictive for select to authenticated
  using (
    public.admin_has_capability('moderation.read')
    or (
      moderation_status = 'VISIBLE'
      and exists (
        select 1 from public.posts parent_post
        where parent_post.id = comments.post_id
          and parent_post.moderation_status = 'VISIBLE'
      )
    )
  );

drop policy if exists "data center visible fixture cheers"
  on public.fixture_cheer_messages;
create policy "data center visible fixture cheers"
  on public.fixture_cheer_messages as restrictive for select to anon
  using (moderation_status = 'VISIBLE');
drop policy if exists "data center visible fixture cheers authenticated"
  on public.fixture_cheer_messages;
create policy "data center visible fixture cheers authenticated"
  on public.fixture_cheer_messages as restrictive for select to authenticated
  using (
    moderation_status = 'VISIBLE'
    or public.admin_has_capability('moderation.read')
  );

drop policy if exists "data center likes belong to visible posts"
  on public.post_likes;
create policy "data center likes belong to visible posts"
  on public.post_likes as restrictive for select to anon, authenticated
  using (
    exists (
      select 1 from public.posts liked_post
      where liked_post.id = post_likes.post_id
        and liked_post.moderation_status = 'VISIBLE'
    )
  );

drop policy if exists "data center likes created on visible posts"
  on public.post_likes;
create policy "data center likes created on visible posts"
  on public.post_likes as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.posts liked_post
      where liked_post.id = post_likes.post_id
        and liked_post.moderation_status = 'VISIBLE'
    )
  );

-- Preserve the exact mobile view column order while filtering at the view
-- layer as well as RLS. search_community_posts already reads this post view.
create or replace view public.community_post_feed
with (security_invoker = true)
as
select
  post.id,
  post.board,
  post.team_id,
  post.category,
  post.title,
  post.content,
  post.image_urls,
  post.author_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  post.created_at,
  post.view_count,
  (
    select count(*)
    from public.comments comment
    where comment.post_id = post.id
      and comment.moderation_status = 'VISIBLE'
  )::integer as comment_count,
  (select count(*) from public.post_likes post_like
    where post_like.post_id = post.id)::integer as like_count,
  post.emoticon_key,
  cardinality(post.image_urls) > 0 as has_images
from public.posts post
join public.profiles profile on profile.id = post.author_id
where post.moderation_status = 'VISIBLE';

create or replace view public.community_comment_feed
with (security_invoker = true)
as
select
  comment.id,
  comment.post_id,
  post.title as post_title,
  comment.user_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  comment.content,
  comment.created_at,
  comment.emoticon_key
from public.comments comment
join public.posts post on post.id = comment.post_id
join public.profiles profile on profile.id = comment.user_id
where comment.moderation_status = 'VISIBLE'
  and post.moderation_status = 'VISIBLE';

create or replace view public.fixture_cheer_feed
with (security_invoker = true)
as
select
  cheer.id,
  cheer.fixture_id,
  cheer.user_id,
  cheer.team_id,
  profile.nickname as author_nickname,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  cheer.content,
  cheer.emoticon_key,
  cheer.created_at
from public.fixture_cheer_messages cheer
join public.profiles profile on profile.id = cheer.user_id
where cheer.moderation_status = 'VISIBLE';

grant select on public.community_post_feed,
  public.community_comment_feed,
  public.fixture_cheer_feed to anon, authenticated;

create or replace function public.admin_get_content_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_row public.content_reports;
  target_data jsonb;
  target_author uuid;
  reporter_data jsonb;
  author_data jsonb;
begin
  if not public.admin_has_capability('moderation.read') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;

  select * into report_row
  from public.content_reports report
  where report.id = p_report_id;
  if not found then
    raise exception 'CONTENT_REPORT_NOT_FOUND';
  end if;

  if report_row.target_type = 'POST' then
    select post.author_id,
      jsonb_build_object(
        'id', post.id,
        'type', 'POST',
        'title', post.title,
        'content', post.content,
        'createdAt', post.created_at,
        'moderationStatus', post.moderation_status
      )
    into target_author, target_data
    from public.posts post where post.id = report_row.post_id;
  elsif report_row.target_type = 'COMMENT' then
    select comment.user_id,
      jsonb_build_object(
        'id', comment.id,
        'type', 'COMMENT',
        'postId', comment.post_id,
        'content', comment.content,
        'createdAt', comment.created_at,
        'moderationStatus', comment.moderation_status
      )
    into target_author, target_data
    from public.comments comment where comment.id = report_row.comment_id;
  else
    select cheer.user_id,
      jsonb_build_object(
        'id', cheer.id,
        'type', 'FIXTURE_CHEER',
        'fixtureId', cheer.fixture_id,
        'content', cheer.content,
        'emoticonKey', cheer.emoticon_key,
        'createdAt', cheer.created_at,
        'moderationStatus', cheer.moderation_status
      )
    into target_author, target_data
    from public.fixture_cheer_messages cheer
    where cheer.id = report_row.cheer_message_id;
  end if;

  select jsonb_build_object(
    'userId', profile.id,
    'nickname', profile.nickname,
    'teamId', profile.team_id
  ) into reporter_data
  from public.profiles profile
  where profile.id = report_row.reporter_user_id;

  select jsonb_build_object(
    'userId', profile.id,
    'nickname', profile.nickname,
    'teamId', profile.team_id,
    'receivedReportCount', (
      select count(*)
      from public.content_reports related
      where exists (
        select 1 from public.posts post
        where post.id = related.post_id and post.author_id = profile.id
      ) or exists (
        select 1 from public.comments comment
        where comment.id = related.comment_id and comment.user_id = profile.id
      ) or exists (
        select 1 from public.fixture_cheer_messages cheer
        where cheer.id = related.cheer_message_id and cheer.user_id = profile.id
      )
    )
  ) into author_data
  from public.profiles profile
  where profile.id = target_author;

  return jsonb_build_object(
    'report', to_jsonb(report_row),
    'reporter', reporter_data,
    'author', author_data,
    'target', target_data,
    'actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', action.id,
        'action', action.action,
        'reason', action.reason,
        'createdBy', action.created_by,
        'createdAt', action.created_at
      ) order by action.created_at asc)
      from public.content_moderation_actions action
      where action.content_report_id = p_report_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_content_report(
  p_report_id uuid,
  p_status text,
  p_resolution_note text default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  before_row public.content_reports;
  normalized_note text := nullif(trim(coalesce(p_resolution_note, '')), '');
  normalized_reason text := trim(coalesce(p_reason, ''));
begin
  if current_actor is null or not public.admin_has_capability('moderation.write') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  if p_status is null
    or p_status not in ('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED') then
    raise exception 'INVALID_CONTENT_REPORT_STATUS';
  end if;
  if char_length(normalized_reason) not between 3 and 1000 then
    raise exception 'MODERATION_REASON_REQUIRED';
  end if;
  if p_status in ('RESOLVED', 'DISMISSED')
    and (normalized_note is null or char_length(normalized_note) > 2000) then
    raise exception 'RESOLUTION_NOTE_REQUIRED';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 2000 then
    raise exception 'RESOLUTION_NOTE_TOO_LONG';
  end if;

  select * into before_row
  from public.content_reports report
  where report.id = p_report_id
  for update;
  if not found then
    raise exception 'CONTENT_REPORT_NOT_FOUND';
  end if;

  update public.content_reports report
  set status = p_status,
      resolution_note = coalesce(normalized_note, report.resolution_note),
      reviewed_by = current_actor,
      reviewed_at = case when p_status = 'OPEN' then report.reviewed_at else now() end
  where report.id = p_report_id;

  perform public.data_center_write_audit(
    'CONTENT_REPORT_STATUS_UPDATE',
    'content_report',
    p_report_id::text,
    jsonb_build_object(
      'status', before_row.status,
      'reviewedAt', before_row.reviewed_at
    ),
    jsonb_build_object(
      'status', p_status,
      'reviewedBy', current_actor,
      'hasResolutionNote', normalized_note is not null
    ),
    normalized_reason
  );
  return true;
end;
$$;

create or replace function public.admin_set_content_visibility(
  p_target_type text,
  p_target_id uuid,
  p_hidden boolean,
  p_reason text,
  p_content_report_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_type text := upper(trim(coalesce(p_target_type, '')));
  normalized_reason text := trim(coalesce(p_reason, ''));
  desired_status text := case when p_hidden then 'HIDDEN' else 'VISIBLE' end;
  action_name text := case when p_hidden then 'HIDE' else 'RESTORE' end;
  before_status text;
  target_exists boolean := false;
begin
  if current_actor is null or not public.admin_has_capability('moderation.write') then
    raise exception 'MODERATION_PERMISSION_REQUIRED';
  end if;
  if normalized_type not in ('POST', 'COMMENT', 'FIXTURE_CHEER') then
    raise exception 'INVALID_MODERATION_TARGET';
  end if;
  if p_hidden is null then
    raise exception 'INVALID_MODERATION_VISIBILITY';
  end if;
  if char_length(normalized_reason) not between 3 and 1000 then
    raise exception 'MODERATION_REASON_REQUIRED';
  end if;

  if normalized_type = 'POST' then
    select post.moderation_status into before_status
    from public.posts post where post.id = p_target_id for update;
    target_exists := found;
  elsif normalized_type = 'COMMENT' then
    select comment.moderation_status into before_status
    from public.comments comment where comment.id = p_target_id for update;
    target_exists := found;
  else
    select cheer.moderation_status into before_status
    from public.fixture_cheer_messages cheer
    where cheer.id = p_target_id for update;
    target_exists := found;
  end if;

  if not target_exists then
    raise exception 'MODERATION_TARGET_NOT_FOUND';
  end if;
  if before_status = desired_status then
    raise exception 'MODERATION_STATE_UNCHANGED';
  end if;

  if p_content_report_id is not null and not exists (
    select 1
    from public.content_reports report
    where report.id = p_content_report_id
      and report.target_type = normalized_type
      and (
        (normalized_type = 'POST' and report.post_id = p_target_id)
        or (normalized_type = 'COMMENT' and report.comment_id = p_target_id)
        or (
          normalized_type = 'FIXTURE_CHEER'
          and report.cheer_message_id = p_target_id
        )
      )
  ) then
    raise exception 'CONTENT_REPORT_TARGET_MISMATCH';
  end if;

  if normalized_type = 'POST' then
    update public.posts post set
      moderation_status = desired_status,
      moderated_at = now()
    where post.id = p_target_id;
  elsif normalized_type = 'COMMENT' then
    update public.comments comment set
      moderation_status = desired_status,
      moderated_at = now()
    where comment.id = p_target_id;
  else
    update public.fixture_cheer_messages cheer set
      moderation_status = desired_status,
      moderated_at = now()
    where cheer.id = p_target_id;
  end if;

  -- Community comment notifications contain a 120-character comment preview.
  -- Redact that in-app copy when either the comment or its parent post is
  -- hidden; restore it only when both rows are visible.  Already-delivered OS
  -- push banners cannot be recalled.
  if normalized_type = 'COMMENT' and p_hidden then
    update public.notifications notification set
      body = '운영 정책에 따라 숨김 처리된 댓글입니다.',
      data = notification.data || '{"moderationHidden":true}'::jsonb
    where notification.dedupe_key = 'comment:' || p_target_id::text;
  elsif normalized_type = 'COMMENT' and not p_hidden then
    update public.notifications notification set
      body = coalesce(profile.nickname, '팬') || ' · '
        || left(comment.content, 120),
      data = notification.data - 'moderationHidden'
    from public.comments comment
    join public.posts parent_post on parent_post.id = comment.post_id
    join public.profiles profile on profile.id = comment.user_id
    where comment.id = p_target_id
      and comment.moderation_status = 'VISIBLE'
      and parent_post.moderation_status = 'VISIBLE'
      and notification.dedupe_key = 'comment:' || comment.id::text;
  elsif normalized_type = 'POST' and p_hidden then
    update public.notifications notification set
      body = '운영 정책에 따라 숨김 처리된 댓글입니다.',
      data = notification.data || '{"moderationHidden":true}'::jsonb
    where notification.dedupe_key in (
      select 'comment:' || comment.id::text
      from public.comments comment
      where comment.post_id = p_target_id
    );
  elsif normalized_type = 'POST' and not p_hidden then
    update public.notifications notification set
      body = coalesce(profile.nickname, '팬') || ' · '
        || left(comment.content, 120),
      data = notification.data - 'moderationHidden'
    from public.comments comment
    join public.profiles profile on profile.id = comment.user_id
    where comment.post_id = p_target_id
      and comment.moderation_status = 'VISIBLE'
      and notification.dedupe_key = 'comment:' || comment.id::text;
  end if;

  insert into public.content_moderation_actions (
    target_type, target_id, action, reason, content_report_id, created_by
  ) values (
    normalized_type, p_target_id, action_name, normalized_reason,
    p_content_report_id, current_actor
  );

  perform public.data_center_write_audit(
    'CONTENT_' || action_name,
    lower(normalized_type),
    p_target_id::text,
    jsonb_build_object('moderationStatus', before_status),
    jsonb_build_object(
      'moderationStatus', desired_status,
      'contentReportId', p_content_report_id
    ),
    normalized_reason
  );
  return true;
end;
$$;

revoke all on function public.admin_get_content_report(uuid)
  from public, anon;
revoke all on function public.admin_update_content_report(
  uuid, text, text, text
) from public, anon;
revoke all on function public.admin_set_content_visibility(
  text, uuid, boolean, text, uuid
) from public, anon;
grant execute on function public.admin_get_content_report(uuid)
  to authenticated;
grant execute on function public.admin_update_content_report(
  uuid, text, text, text
) to authenticated;
grant execute on function public.admin_set_content_visibility(
  text, uuid, boolean, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Verified football-player localizations and manual-player provenance.
--
-- Keep the existing apply_football_player_localization_trigger in place: the
-- verified-name RPC writes the canonical localization row and that trigger
-- continues to propagate the Korean name into team_players and lineups.  The
-- private review/record tables avoid exposing administrator UUIDs and reasons
-- through the mobile tables' existing table-wide SELECT grants.
-- ---------------------------------------------------------------------------

create table if not exists public.football_player_localization_reviews (
  id bigint generated by default as identity primary key,
  provider text not null,
  provider_player_id text not null,
  before_name_ko text,
  after_name_ko text not null,
  reason text not null check (char_length(reason) between 3 and 1000),
  changed_by uuid references public.admin_users(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists football_player_localization_reviews_player_idx
  on public.football_player_localization_reviews (
    provider, provider_player_id, created_at desc
  );

alter table public.football_player_localization_reviews enable row level security;

drop policy if exists "data editors read localization reviews"
  on public.football_player_localization_reviews;
create policy "data editors read localization reviews"
  on public.football_player_localization_reviews for select to authenticated
  using (public.admin_has_capability('football.read'));

revoke all on table public.football_player_localization_reviews
  from public, anon, authenticated;
grant select on table public.football_player_localization_reviews
  to authenticated;
grant all on table public.football_player_localization_reviews
  to service_role;

create or replace function public.data_center_preserve_verified_localization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if coalesce((select auth.role()), '') = 'service_role'
      and old.is_verified
    then
      -- Returning NULL cancels provider-sync deletion of an operator-verified
      -- localization while preserving ordinary administrator maintenance.
      return null;
    end if;
    return old;
  end if;

  if coalesce((select auth.role()), '') = 'service_role'
    and old.is_verified
  then
    new.name_ko := old.name_ko;
    new.is_verified := true;
  end if;
  return new;
end;
$$;

revoke all on function public.data_center_preserve_verified_localization()
  from public, anon, authenticated;

drop trigger if exists data_center_preserve_verified_localization
  on public.football_player_localizations;
create trigger data_center_preserve_verified_localization
  before update of name_ko, is_verified or delete
  on public.football_player_localizations
  for each row execute function public.data_center_preserve_verified_localization();

create or replace function public.admin_set_verified_player_name(
  p_provider_player_id text,
  p_name_ko text,
  p_reason text
)
returns public.football_player_localizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_player_id text := trim(coalesce(p_provider_player_id, ''));
  normalized_name text := trim(coalesce(p_name_ko, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  source_name_en text;
  before_name text;
  result_row public.football_player_localizations;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if char_length(normalized_player_id) not between 1 and 120
    or char_length(normalized_name) not between 1 and 120
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_VERIFIED_PLAYER_NAME';
  end if;
  if left(normalized_player_id, 7) = 'manual_'
    or exists (
      select 1 from public.team_players player
      where player.player_id = normalized_player_id
        and player.data_source = 'MANUAL'
    )
  then
    raise exception 'MANUAL_PLAYER_REQUIRES_MANUAL_EDIT';
  end if;

  select localization.name_en, localization.name_ko
  into source_name_en, before_name
  from public.football_player_localizations localization
  where localization.provider = 'sportmonks'
    and localization.provider_player_id = normalized_player_id
  for update;

  if source_name_en is null then
    select coalesce(nullif(trim(player.display_name), ''), player.player_name)
    into source_name_en
    from public.team_players player
    where player.player_id = normalized_player_id
    order by player.updated_at desc
    limit 1;
  end if;
  if source_name_en is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  -- A canonical verified localization supersedes the older per-season player
  -- display-name override.  Dynamic SQL keeps this migration usable when the
  -- optional admin manual_overrides table has not yet been installed.
  if to_regclass('public.manual_overrides') is not null then
    execute $release_override$
      update public.manual_overrides
      set released_by = $1,
          released_at = now(),
          release_reason = $2,
          blocks_sync = false,
          updated_at = now()
      where entity_type = 'player'
        and entity_id = $3
        and field_path = 'display_name_ko'
        and released_at is null
    $release_override$
    using current_actor, normalized_reason, normalized_player_id;
  end if;

  insert into public.football_player_localizations (
    provider, provider_player_id, name_en, name_ko, is_verified, updated_at
  ) values (
    'sportmonks', normalized_player_id, source_name_en, normalized_name, true,
    now()
  )
  on conflict (provider, provider_player_id) do update set
    name_en = excluded.name_en,
    name_ko = excluded.name_ko,
    is_verified = true,
    updated_at = now()
  returning * into result_row;

  insert into public.football_player_localization_reviews (
    provider, provider_player_id, before_name_ko, after_name_ko, reason,
    changed_by
  ) values (
    'sportmonks', normalized_player_id, before_name, normalized_name,
    normalized_reason, current_actor
  );

  perform public.data_center_write_audit(
    'PLAYER_VERIFIED_NAME_SET',
    'football_player_localization',
    normalized_player_id,
    jsonb_build_object('nameKo', before_name),
    jsonb_build_object('nameKo', normalized_name, 'verified', true),
    normalized_reason
  );
  return result_row;
end;
$$;

revoke all on function public.admin_set_verified_player_name(text, text, text)
  from public, anon;
grant execute on function public.admin_set_verified_player_name(text, text, text)
  to authenticated;

alter table public.team_players
  add column if not exists data_source text not null default 'SPORTSMONKS',
  add column if not exists manual_lock boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_players'::regclass
      and conname = 'team_players_data_source_check'
  ) then
    alter table public.team_players
      add constraint team_players_data_source_check
      check (data_source in ('SPORTSMONKS', 'MANUAL'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.team_players'::regclass
      and conname = 'team_players_manual_id_check'
  ) then
    alter table public.team_players
      add constraint team_players_manual_id_check
      check (
        data_source <> 'MANUAL'
        or player_id ~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  end if;
end
$$;

create table if not exists public.manual_player_records (
  season integer not null,
  league_id text not null,
  player_id text not null,
  team_id text not null,
  created_by uuid references public.admin_users(user_id) on delete set null,
  creation_reason text not null check (
    char_length(creation_reason) between 3 and 1000
  ),
  created_at timestamptz not null default now(),
  updated_by uuid references public.admin_users(user_id) on delete set null,
  update_reason text,
  updated_at timestamptz not null default now(),
  merged_into_player_id text,
  merged_by uuid references public.admin_users(user_id) on delete set null,
  merged_reason text,
  merged_at timestamptz,
  primary key (season, league_id, player_id),
  check (
    (merged_at is null and merged_into_player_id is null and merged_by is null
      and merged_reason is null)
    or
    (merged_at is not null and merged_into_player_id is not null
      and merged_reason is not null)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manual_player_records'::regclass
      and conname = 'manual_player_records_update_reason_check'
  ) then
    alter table public.manual_player_records
      add constraint manual_player_records_update_reason_check
      check (
        update_reason is null
        or char_length(update_reason) between 3 and 1000
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.manual_player_records'::regclass
      and conname = 'manual_player_records_merge_reason_check'
  ) then
    alter table public.manual_player_records
      add constraint manual_player_records_merge_reason_check
      check (
        merged_reason is null
        or char_length(merged_reason) between 3 and 1000
      );
  end if;
end
$$;

create index if not exists manual_player_records_team_idx
  on public.manual_player_records (team_id, season, league_id, created_at desc);
create index if not exists manual_player_records_merge_idx
  on public.manual_player_records (
    merged_into_player_id, season, league_id, merged_at desc
  ) where merged_at is not null;

alter table public.manual_player_records enable row level security;

drop policy if exists "data editors read manual player records"
  on public.manual_player_records;
create policy "data editors read manual player records"
  on public.manual_player_records for select to authenticated
  using (public.admin_has_capability('football.read'));

revoke all on table public.manual_player_records
  from public, anon, authenticated;
grant select on table public.manual_player_records to authenticated;
grant all on table public.manual_player_records to service_role;

create or replace function public.data_center_protect_locked_manual_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.data_source = 'MANUAL'
    and old.manual_lock
    and coalesce((select auth.role()), '') = 'service_role'
  then
    if tg_op = 'DELETE' then
      return null;
    end if;
    -- Returning OLD makes provider bulk deactivation/upsert a no-op for this
    -- row.  The trigger name sorts after the legacy override trigger so it is
    -- also the final guard on UPDATE.
    return old;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.data_center_protect_locked_manual_player()
  from public, anon, authenticated;

drop trigger if exists zz_data_center_protect_locked_manual_players
  on public.team_players;
create trigger zz_data_center_protect_locked_manual_players
  before update or delete on public.team_players
  for each row execute function public.data_center_protect_locked_manual_player();

create or replace function public.admin_create_manual_player(
  p_team_id text,
  p_player_name text,
  p_reason text,
  p_display_name_ko text default null,
  p_shirt_number integer default null,
  p_position text default null,
  p_detailed_position text default null,
  p_season integer default 2026,
  p_league_id text default 'kleague'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_team_id text := trim(coalesce(p_team_id, ''));
  normalized_player_name text := trim(coalesce(p_player_name, ''));
  normalized_name_ko text := nullif(trim(coalesce(p_display_name_ko, '')), '');
  normalized_reason text := trim(coalesce(p_reason, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  new_player_id text := 'manual_' || gen_random_uuid()::text;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if char_length(normalized_team_id) not between 1 and 120
    or char_length(normalized_player_name) not between 1 and 120
    or (normalized_name_ko is not null and char_length(normalized_name_ko) > 120)
    or char_length(normalized_reason) not between 3 and 1000
    or char_length(normalized_league_id) not between 1 and 120
    or p_season is null or p_season not between 2000 and 2200
    or p_shirt_number is not null and p_shirt_number not between 0 and 999
    or char_length(trim(coalesce(p_position, ''))) > 120
    or char_length(trim(coalesce(p_detailed_position, ''))) > 120
  then
    raise exception 'INVALID_MANUAL_PLAYER';
  end if;
  if not exists (
    select 1 from public.teams team where team.id = normalized_team_id
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  insert into public.team_players (
    season, league_id, team_id, player_id, player_name, display_name,
    display_name_ko, shirt_number, position, detailed_position, in_squad,
    data_source, manual_lock, updated_at
  ) values (
    p_season, normalized_league_id, normalized_team_id, new_player_id,
    normalized_player_name, normalized_player_name, normalized_name_ko,
    p_shirt_number, nullif(trim(coalesce(p_position, '')), ''),
    nullif(trim(coalesce(p_detailed_position, '')), ''), true, 'MANUAL', true,
    now()
  );

  insert into public.football_player_localizations (
    provider, provider_player_id, name_en, name_ko, is_verified, updated_at
  ) values (
    'manual', new_player_id, normalized_player_name, normalized_name_ko,
    normalized_name_ko is not null, now()
  )
  on conflict (provider, provider_player_id) do update set
    name_en = excluded.name_en,
    name_ko = excluded.name_ko,
    is_verified = excluded.is_verified,
    updated_at = now();

  insert into public.manual_player_records (
    season, league_id, player_id, team_id, created_by, creation_reason
  ) values (
    p_season, normalized_league_id, new_player_id, normalized_team_id,
    current_actor, normalized_reason
  );

  if normalized_name_ko is not null then
    insert into public.football_player_localization_reviews (
      provider, provider_player_id, before_name_ko, after_name_ko, reason,
      changed_by
    ) values (
      'manual', new_player_id, null, normalized_name_ko, normalized_reason,
      current_actor
    );
  end if;

  perform public.data_center_write_audit(
    'MANUAL_PLAYER_CREATED',
    'team_player',
    new_player_id,
    null,
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'teamId', normalized_team_id,
      'playerName', normalized_player_name,
      'displayNameKo', normalized_name_ko,
      'shirtNumber', p_shirt_number,
      'position', nullif(trim(coalesce(p_position, '')), ''),
      'detailedPosition', nullif(trim(coalesce(p_detailed_position, '')), ''),
      'inSquad', true,
      'dataSource', 'MANUAL',
      'manualLock', true
    ),
    normalized_reason
  );
  return new_player_id;
end;
$$;

create or replace function public.admin_update_manual_player(
  p_player_id text,
  p_season integer,
  p_league_id text,
  p_team_id text,
  p_player_name text,
  p_display_name_ko text,
  p_shirt_number integer,
  p_position text,
  p_detailed_position text,
  p_in_squad boolean,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_player_id text := trim(coalesce(p_player_id, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  normalized_team_id text := trim(coalesce(p_team_id, ''));
  normalized_player_name text := trim(coalesce(p_player_name, ''));
  normalized_name_ko text := nullif(trim(coalesce(p_display_name_ko, '')), '');
  normalized_reason text := trim(coalesce(p_reason, ''));
  before_row jsonb;
  before_name_ko text;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if normalized_player_id !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or char_length(normalized_league_id) not between 1 and 120
    or char_length(normalized_team_id) not between 1 and 120
    or char_length(normalized_player_name) not between 1 and 120
    or (normalized_name_ko is not null and char_length(normalized_name_ko) > 120)
    or char_length(normalized_reason) not between 3 and 1000
    or p_season is null or p_season not between 2000 and 2200
    or p_shirt_number is not null and p_shirt_number not between 0 and 999
    or char_length(trim(coalesce(p_position, ''))) > 120
    or char_length(trim(coalesce(p_detailed_position, ''))) > 120
    or p_in_squad is null
  then
    raise exception 'INVALID_MANUAL_PLAYER';
  end if;
  if not exists (
    select 1 from public.teams team where team.id = normalized_team_id
  ) then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  select to_jsonb(player), player.display_name_ko
  into before_row, before_name_ko
  from public.team_players player
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_player_id
    and player.data_source = 'MANUAL'
  for update;
  if before_row is null then
    raise exception 'MANUAL_PLAYER_NOT_FOUND';
  end if;

  update public.team_players player set
    team_id = normalized_team_id,
    player_name = normalized_player_name,
    display_name = normalized_player_name,
    display_name_ko = normalized_name_ko,
    shirt_number = p_shirt_number,
    position = nullif(trim(coalesce(p_position, '')), ''),
    detailed_position = nullif(trim(coalesce(p_detailed_position, '')), ''),
    in_squad = p_in_squad,
    manual_lock = true,
    updated_at = now()
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_player_id;

  insert into public.football_player_localizations (
    provider, provider_player_id, name_en, name_ko, is_verified, updated_at
  ) values (
    'manual', normalized_player_id, normalized_player_name, normalized_name_ko,
    normalized_name_ko is not null, now()
  )
  on conflict (provider, provider_player_id) do update set
    name_en = excluded.name_en,
    name_ko = excluded.name_ko,
    is_verified = excluded.is_verified,
    updated_at = now();

  update public.manual_player_records record set
    team_id = normalized_team_id,
    updated_by = current_actor,
    update_reason = normalized_reason,
    updated_at = now()
  where record.season = p_season
    and record.league_id = normalized_league_id
    and record.player_id = normalized_player_id
    and record.merged_at is null;
  if not found then
    raise exception 'MANUAL_PLAYER_RECORD_NOT_FOUND';
  end if;

  if before_name_ko is distinct from normalized_name_ko
    and normalized_name_ko is not null
  then
    insert into public.football_player_localization_reviews (
      provider, provider_player_id, before_name_ko, after_name_ko, reason,
      changed_by
    ) values (
      'manual', normalized_player_id, before_name_ko, normalized_name_ko,
      normalized_reason, current_actor
    );
  end if;

  perform public.data_center_write_audit(
    'MANUAL_PLAYER_UPDATED',
    'team_player',
    normalized_player_id,
    before_row - 'image_url',
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'teamId', normalized_team_id,
      'playerName', normalized_player_name,
      'displayNameKo', normalized_name_ko,
      'shirtNumber', p_shirt_number,
      'position', nullif(trim(coalesce(p_position, '')), ''),
      'detailedPosition', nullif(trim(coalesce(p_detailed_position, '')), ''),
      'inSquad', p_in_squad,
      'dataSource', 'MANUAL',
      'manualLock', true
    ),
    normalized_reason
  );
  return true;
end;
$$;

create or replace function public.admin_merge_manual_player(
  p_manual_player_id text,
  p_provider_player_id text,
  p_season integer,
  p_league_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_manual_id text := trim(coalesce(p_manual_player_id, ''));
  normalized_provider_id text := trim(coalesce(p_provider_player_id, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  manual_row public.team_players;
  provider_row public.team_players;
  manual_name_ko text;
  manual_verified boolean := false;
  provider_name_ko text;
  provider_verified boolean := false;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;
  if normalized_manual_id !~ '^manual_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or char_length(normalized_provider_id) not between 1 and 120
    or normalized_manual_id = normalized_provider_id
    or char_length(normalized_league_id) not between 1 and 120
    or p_season is null or p_season not between 2000 and 2200
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_PLAYER_MERGE';
  end if;

  select player.* into manual_row
  from public.team_players player
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_manual_id
    and player.data_source = 'MANUAL'
  for update;
  if not found then
    raise exception 'MANUAL_PLAYER_NOT_FOUND';
  end if;

  select player.* into provider_row
  from public.team_players player
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_provider_id
    and player.data_source = 'SPORTSMONKS'
  for update;
  if not found then
    raise exception 'PROVIDER_PLAYER_NOT_FOUND';
  end if;

  select localization.name_ko, localization.is_verified
  into manual_name_ko, manual_verified
  from public.football_player_localizations localization
  where localization.provider = 'manual'
    and localization.provider_player_id = normalized_manual_id;

  select localization.name_ko, localization.is_verified
  into provider_name_ko, provider_verified
  from public.football_player_localizations localization
  where localization.provider = 'sportmonks'
    and localization.provider_player_id = normalized_provider_id
  for update;

  if manual_name_ko is not null
    and provider_verified
    and provider_name_ko is distinct from manual_name_ko
  then
    raise exception 'VERIFIED_PLAYER_NAME_CONFLICT';
  end if;

  if manual_name_ko is not null then
    insert into public.football_player_localizations (
      provider, provider_player_id, name_en, name_ko, is_verified, updated_at
    ) values (
      'sportmonks', normalized_provider_id,
      coalesce(nullif(trim(provider_row.display_name), ''), provider_row.player_name),
      manual_name_ko,
      true,
      now()
    )
    on conflict (provider, provider_player_id) do update set
      name_en = excluded.name_en,
      name_ko = case
        when public.football_player_localizations.is_verified
          then public.football_player_localizations.name_ko
        else excluded.name_ko
      end,
      is_verified = true,
      updated_at = now();

    if provider_name_ko is null or not coalesce(provider_verified, false) then
      insert into public.football_player_localization_reviews (
        provider, provider_player_id, before_name_ko, after_name_ko, reason,
        changed_by
      ) values (
        'sportmonks', normalized_provider_id, provider_name_ko, manual_name_ko,
        normalized_reason, current_actor
      );
    end if;
  end if;

  update public.team_players player set
    in_squad = false,
    manual_lock = false,
    updated_at = now()
  where player.season = p_season
    and player.league_id = normalized_league_id
    and player.player_id = normalized_manual_id;

  update public.manual_player_records record set
    merged_into_player_id = normalized_provider_id,
    merged_by = current_actor,
    merged_reason = normalized_reason,
    merged_at = now(),
    updated_by = current_actor,
    update_reason = normalized_reason,
    updated_at = now()
  where record.season = p_season
    and record.league_id = normalized_league_id
    and record.player_id = normalized_manual_id
    and record.merged_at is null;
  if not found then
    raise exception 'MANUAL_PLAYER_RECORD_NOT_FOUND';
  end if;

  perform public.data_center_write_audit(
    'MANUAL_PLAYER_MERGED',
    'team_player',
    normalized_manual_id,
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'teamId', manual_row.team_id,
      'inSquad', manual_row.in_squad,
      'manualLock', manual_row.manual_lock
    ),
    jsonb_build_object(
      'mergedIntoPlayerId', normalized_provider_id,
      'providerTeamId', provider_row.team_id,
      'inSquad', false,
      'manualLock', false
    ),
    normalized_reason
  );
  return true;
end;
$$;

revoke all on function public.admin_create_manual_player(
  text, text, text, text, integer, text, text, integer, text
) from public, anon;
revoke all on function public.admin_update_manual_player(
  text, integer, text, text, text, text, integer, text, text, boolean, text
) from public, anon;
revoke all on function public.admin_merge_manual_player(
  text, text, integer, text, text
) from public, anon;
grant execute on function public.admin_create_manual_player(
  text, text, text, text, integer, text, text, integer, text
) to authenticated;
grant execute on function public.admin_update_manual_player(
  text, integer, text, text, text, text, integer, text, text, boolean, text
) to authenticated;
grant execute on function public.admin_merge_manual_player(
  text, text, integer, text, text
) to authenticated;

-- Keep the existing one-shot/locked standings implementation unchanged.  The
-- data_editor legacy rank above satisfies its is_admin('admin') guard; these
-- conditional grants only restore EXECUTE if that optional admin migration is
-- present in the reconciled remote history.
do $$
begin
  if to_regprocedure(
    'public.apply_standing_manual_override(text,integer,text,text,jsonb,text)'
  ) is not null then
    grant execute on function public.apply_standing_manual_override(
      text, integer, text, text, jsonb, text
    ) to authenticated;
  end if;
  if to_regprocedure(
    'public.release_entity_manual_override(uuid,text,text)'
  ) is not null then
    grant execute on function public.release_entity_manual_override(
      uuid, text, text
    ) to authenticated;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Exact Storage usage derived from storage.objects.  This replaces capped
-- REST pagination for administration reads without granting direct access to
-- object rows or names.
-- ---------------------------------------------------------------------------

create or replace function public.admin_get_storage_usage()
returns table (
  bucket_id text,
  object_count bigint,
  used_bytes numeric,
  unmeasured_object_count bigint,
  oldest_object_at timestamptz,
  newest_object_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not public.admin_has_capability('storage.read')
  then
    raise exception 'STORAGE_READER_REQUIRED';
  end if;

  return query
  select
    bucket.id::text,
    count(object.id)::bigint,
    coalesce(sum(
      case
        when coalesce(object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (object.metadata ->> 'size')::numeric
        else 0::numeric
      end
    ), 0::numeric) as used_bytes,
    count(object.id) filter (
      where object.id is not null
        and coalesce(object.metadata ->> 'size', '') !~ '^[0-9]+$'
    )::bigint as unmeasured_object_count,
    min(object.created_at) as oldest_object_at,
    max(object.created_at) as newest_object_at
  from storage.buckets bucket
  left join storage.objects object on object.bucket_id = bucket.id
  group by bucket.id
  order by bucket.id;
end;
$$;

revoke all on function public.admin_get_storage_usage()
  from public, anon;
grant execute on function public.admin_get_storage_usage()
  to authenticated;

comment on function public.admin_get_storage_usage() is
  'Returns per-bucket object counts, metadata.size bytes, and missing-size counts; never returns object paths.';

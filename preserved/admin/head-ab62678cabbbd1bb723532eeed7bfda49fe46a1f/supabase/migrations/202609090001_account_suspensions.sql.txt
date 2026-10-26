-- Separate community-only suspensions from full account suspensions.
-- Full account suspensions are mirrored to Supabase Auth by the admin API.
-- The database guard below also blocks still-valid access tokens immediately.

alter table public.user_moderation_states
  add column if not exists account_suspended_until timestamptz,
  add column if not exists account_suspension_reason text,
  add column if not exists account_suspended_by uuid references public.admin_users(user_id) on delete set null,
  add column if not exists account_suspended_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.user_moderation_states'::regclass
      and conname = 'user_moderation_states_account_suspension_check'
  ) then
    alter table public.user_moderation_states
      add constraint user_moderation_states_account_suspension_check check (
        (
          account_suspended_until is null
          and account_suspension_reason is null
          and account_suspended_at is null
        )
        or (
          account_suspended_until is not null
          and account_suspension_reason is not null
          and char_length(trim(account_suspension_reason)) between 3 and 1000
          and account_suspended_at is not null
        )
      );
  end if;
end
$$;

create index if not exists user_moderation_states_account_suspended_idx
  on public.user_moderation_states (account_suspended_until)
  where account_suspended_until is not null;

alter table public.user_moderation_actions
  drop constraint if exists user_moderation_actions_action_check,
  drop constraint if exists user_moderation_actions_expiry_check;

alter table public.user_moderation_actions
  add constraint user_moderation_actions_action_check check (
    action in (
      'WARN', 'SUSPEND', 'UNSUSPEND',
      'ACCOUNT_SUSPEND', 'ACCOUNT_UNSUSPEND'
    )
  ),
  add constraint user_moderation_actions_expiry_check check (
    (action in ('SUSPEND', 'ACCOUNT_SUSPEND') and suspended_until is not null)
    or (action not in ('SUSPEND', 'ACCOUNT_SUSPEND') and suspended_until is null)
  );

create or replace function public.can_current_user_access_app()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and not exists (
      select 1
      from public.user_moderation_states state
      where state.user_id = (select auth.uid())
        and state.account_suspended_until > now()
    );
$$;

revoke all on function public.can_current_user_access_app()
  from public, anon;
grant execute on function public.can_current_user_access_app()
  to authenticated;

create or replace function public.data_center_enforce_account_suspension()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'authenticated'
    and not public.can_current_user_access_app() then
    raise exception 'ACCOUNT_SUSPENDED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.data_center_enforce_account_suspension()
  from public, anon, authenticated;

-- Apply an account-level guard to every current application table protected by
-- RLS. The trigger also covers SECURITY DEFINER write functions that bypass RLS.
do $$
declare
  target record;
begin
  for target in
    select namespace.nspname as schema_name, relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relrowsecurity
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      'data center active accounts access app',
      target.schema_name,
      target.table_name
    );
    execute format(
      'create policy %I on %I.%I as restrictive for all to authenticated using (public.can_current_user_access_app()) with check (public.can_current_user_access_app())',
      'data center active accounts access app',
      target.schema_name,
      target.table_name
    );
    execute format(
      'drop trigger if exists %I on %I.%I',
      'data_center_account_suspension_guard',
      target.schema_name,
      target.table_name
    );
    execute format(
      'create trigger %I before insert or update or delete on %I.%I for each row execute function public.data_center_enforce_account_suspension()',
      'data_center_account_suspension_guard',
      target.schema_name,
      target.table_name
    );
  end loop;
end
$$;

drop policy if exists "data center active accounts access storage"
  on storage.objects;
create policy "data center active accounts access storage"
  on storage.objects as restrictive for all to authenticated
  using (public.can_current_user_access_app())
  with check (public.can_current_user_access_app());

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
      when state.account_suspended_until > now() then 'ACCOUNT_SUSPENDED'
      when state.suspended_until > now() then 'COMMUNITY_SUSPENDED'
      else 'ACTIVE'
    end,
    case
      when state.account_suspended_until > now() then state.account_suspended_until
      when state.suspended_until > now() then state.suspended_until
      else null
    end,
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
  if normalized_action not in (
    'WARN', 'SUSPEND', 'UNSUSPEND',
    'ACCOUNT_SUSPEND', 'ACCOUNT_UNSUSPEND'
  ) then
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
  if normalized_action in ('SUSPEND', 'ACCOUNT_SUSPEND') and (
    p_suspended_until is null
    or p_suspended_until <= now()
    or p_suspended_until > now() + interval '365 days 1 minute'
  ) then
    raise exception 'INVALID_SUSPENSION_WINDOW';
  end if;

  select jsonb_build_object(
    'communitySuspendedUntil', state.suspended_until,
    'communitySuspensionReason', state.suspension_reason,
    'accountSuspendedUntil', state.account_suspended_until,
    'accountSuspensionReason', state.account_suspension_reason
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
  elsif normalized_action = 'ACCOUNT_SUSPEND' then
    insert into public.user_moderation_states (
      user_id, account_suspended_until, account_suspension_reason,
      account_suspended_by, account_suspended_at
    ) values (
      p_user_id, p_suspended_until, normalized_reason, current_actor, now()
    )
    on conflict (user_id) do update set
      account_suspended_until = excluded.account_suspended_until,
      account_suspension_reason = excluded.account_suspension_reason,
      account_suspended_by = excluded.account_suspended_by,
      account_suspended_at = excluded.account_suspended_at,
      updated_at = now();
  elsif normalized_action = 'ACCOUNT_UNSUSPEND' then
    insert into public.user_moderation_states (user_id)
    values (p_user_id)
    on conflict (user_id) do update set
      account_suspended_until = null,
      account_suspension_reason = null,
      account_suspended_by = current_actor,
      account_suspended_at = null,
      updated_at = now();
  end if;

  insert into public.user_moderation_actions (
    user_id, action, reason, suspended_until, content_report_id, created_by
  ) values (
    p_user_id,
    normalized_action,
    normalized_reason,
    case when normalized_action in ('SUSPEND', 'ACCOUNT_SUSPEND') then p_suspended_until end,
    p_content_report_id,
    current_actor
  ) returning id into created_action;

  select jsonb_build_object(
    'communitySuspendedUntil', state.suspended_until,
    'communitySuspensionReason', state.suspension_reason,
    'accountSuspendedUntil', state.account_suspended_until,
    'accountSuspensionReason', state.account_suspension_reason
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
      when normalized_action in ('SUSPEND', 'ACCOUNT_SUSPEND') then p_suspended_until
      else null
    end
  );
end;
$$;

revoke all on function public.can_current_user_access_app()
  from public, anon;
revoke all on function public.data_center_enforce_account_suspension()
  from public, anon, authenticated;
revoke all on function public.admin_get_users(text, integer, integer)
  from public, anon;
revoke all on function public.admin_apply_user_action(
  uuid, text, text, timestamptz, uuid
) from public, anon;
grant execute on function public.can_current_user_access_app()
  to authenticated;
grant execute on function public.admin_get_users(text, integer, integer)
  to authenticated;
grant execute on function public.admin_apply_user_action(
  uuid, text, text, timestamptz, uuid
) to authenticated;

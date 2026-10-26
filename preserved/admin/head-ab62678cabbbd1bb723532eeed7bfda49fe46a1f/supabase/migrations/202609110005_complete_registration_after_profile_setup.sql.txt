-- Treat an OAuth identity as a completed KickON signup only after the user has
-- accepted the required documents and saved both a supporter team and nickname.

create or replace function public.set_profile_registration_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.signup_consented_at is not null
    and new.terms_version is not null
    and new.privacy_version is not null
    and new.community_policy_version is not null
    and new.age_confirmed_at is not null
    and new.team_id is not null
    and nullif(trim(new.nickname), '') is not null then
    new.registration_completed_at := coalesce(
      new.registration_completed_at,
      now()
    );
  else
    new.registration_completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_profile_registration_completed_at()
  from public, anon, authenticated;

drop trigger if exists profiles_set_registration_completed_at
  on public.profiles;
create trigger profiles_set_registration_completed_at
before insert or update on public.profiles
for each row execute function public.set_profile_registration_completed_at();

-- Correct legacy completion timestamps before installing the new Discord
-- trigger, so existing members do not generate duplicate signup messages.
update public.profiles
set registration_completed_at = null
where registration_completed_at is not null
  and (
    signup_consented_at is null
    or terms_version is null
    or privacy_version is null
    or community_policy_version is null
    or age_confirmed_at is null
    or team_id is null
    or nullif(trim(nickname), '') is null
  );

update public.profiles
set registration_completed_at = greatest(
  signup_consented_at,
  coalesce(team_selected_at, created_at),
  coalesce(nickname_changed_at, created_at)
)
where registration_completed_at is null
  and signup_consented_at is not null
  and terms_version is not null
  and privacy_version is not null
  and community_policy_version is not null
  and age_confirmed_at is not null
  and team_id is not null
  and nullif(trim(nickname), '') is not null;

create or replace function public.accept_signup_consents(
  terms_document_version text,
  privacy_document_version text,
  community_document_version text,
  age_document_version text,
  notifications_document_version text,
  notifications_enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  accepted_at timestamptz := now();
  updated_profile public.profiles;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(terms_document_version), '') is null
    or nullif(trim(privacy_document_version), '') is null
    or nullif(trim(community_document_version), '') is null
    or nullif(trim(age_document_version), '') is null
    or nullif(trim(notifications_document_version), '') is null then
    raise exception 'CONSENT_VERSION_REQUIRED';
  end if;

  insert into public.user_consents (
    user_id,
    document_type,
    document_version,
    agreed,
    agreed_at
  ) values
    (current_user_id, 'TERMS', terms_document_version, true, accepted_at),
    (current_user_id, 'PRIVACY', privacy_document_version, true, accepted_at),
    (current_user_id, 'COMMUNITY', community_document_version, true, accepted_at),
    (current_user_id, 'AGE', age_document_version, true, accepted_at),
    (
      current_user_id,
      'NOTIFICATIONS',
      notifications_document_version,
      notifications_enabled,
      accepted_at
    )
  on conflict (user_id, document_type, document_version)
  do update set
    agreed = excluded.agreed,
    agreed_at = excluded.agreed_at;

  update public.notification_preferences
  set
    match_notifications_enabled = notifications_enabled,
    lineup_notifications_enabled = notifications_enabled,
    community_notifications_enabled = notifications_enabled
  where user_id = current_user_id;

  update public.profiles
  set
    signup_consented_at = accepted_at,
    terms_version = terms_document_version,
    privacy_version = privacy_document_version,
    community_policy_version = community_document_version,
    age_confirmed_at = accepted_at
  where id = current_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

revoke all on function public.accept_signup_consents(
  text, text, text, text, text, boolean
) from public, anon;
grant execute on function public.accept_signup_consents(
  text, text, text, text, text, boolean
) to authenticated;

drop trigger if exists profiles_notify_discord_after_insert
  on public.profiles;
drop trigger if exists profiles_notify_discord_after_registration_completed
  on public.profiles;

create or replace function public.notify_discord_on_registration_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supporter_team_name text;
begin
  select team.name into supporter_team_name
  from public.teams team
  where team.id = new.team_id;

  perform public.enqueue_discord_admin_notification(
    jsonb_build_object(
      'username', 'KickON 운영 알림',
      'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title', '신규 가입자가 있습니다',
          'description', '응원 팀과 닉네임 설정을 마치고 KickON 가입을 완료했습니다.',
          'color', 3447003,
          'fields', jsonb_build_array(
            jsonb_build_object(
              'name', '사용자 ID',
              'value', '`' || new.id::text || '`',
              'inline', false
            ),
            jsonb_build_object(
              'name', '닉네임',
              'value', left(new.nickname, 100),
              'inline', true
            ),
            jsonb_build_object(
              'name', '응원 팀',
              'value', left(coalesce(supporter_team_name, new.team_id), 100),
              'inline', true
            ),
            jsonb_build_object(
              'name', '가입 시각',
              'value', to_char(
                new.registration_completed_at at time zone 'Asia/Seoul',
                'YYYY-MM-DD HH24:MI'
              ) || ' KST',
              'inline', true
            )
          ),
          'timestamp', new.registration_completed_at
        )
      )
    )
  );
  return new;
exception
  when others then
    raise warning 'KickON completed signup Discord notification build failed';
    return new;
end;
$$;

revoke all on function public.notify_discord_on_registration_completed()
  from public, anon, authenticated;

create trigger profiles_notify_discord_after_registration_completed
after update of registration_completed_at on public.profiles
for each row
when (
  old.registration_completed_at is null
  and new.registration_completed_at is not null
)
execute function public.notify_discord_on_registration_completed();

drop function if exists public.notify_discord_on_profile_created();

create or replace function public.admin_get_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_sync_available boolean := to_regclass('public.sync_runs') is not null;
  v_failed_sync_count bigint := null;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('dashboard.read')
    )
  then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;

  if v_sync_available then
    execute '
      select count(*)::bigint
      from public.sync_runs run
      where run.created_at >= $1
        and run.status in (''failed'', ''partial'')
        and (
          run.status = ''failed''
          or coalesce(run.failed_count, 0) > 0
          or nullif(run.error_code, '''') is not null
          or nullif(run.error_message, '''') is not null
        )
    '
    into v_failed_sync_count
    using v_now - interval '24 hours';
  end if;

  return jsonb_build_object(
    'generatedAt', v_now,
    'totalProfiles', (
      select count(*)
      from public.profiles profile
      where profile.registration_completed_at is not null
        and not exists (
          select 1
          from public.admin_users administrator
          where administrator.user_id = profile.id
        )
        and not exists (
          select 1
          from auth.identities identity
          where identity.user_id = profile.id
            and lower(identity.provider) = 'email'
        )
    ),
    'excludesServiceAccounts', true,
    'syncAvailable', v_sync_available,
    'failedSyncCount', v_failed_sync_count
  );
end;
$$;

revoke all on function public.admin_get_dashboard_summary()
  from public, anon;
grant execute on function public.admin_get_dashboard_summary()
  to authenticated, service_role;

comment on function public.admin_get_dashboard_summary() is
  'Returns completed app-member totals excluding admin and email accounts, plus the last-24-hour sync failure count.';

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
    left join public.profiles profile
      on profile.team_id = team.id
      and profile.registration_completed_at is not null
    group by team.id, team.name
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
    'totalProfiles', (
      select count(*) from public.profiles profile
      where profile.registration_completed_at is not null
    ),
    'newToday', (
      select count(*) from public.profiles profile
      where profile.registration_completed_at >= v_today_start
    ),
    'new7d', (
      select count(*) from public.profiles profile
      where profile.registration_completed_at >= v_seven_day_start
    ),
    'newMonth', (
      select count(*) from public.profiles profile
      where profile.registration_completed_at >= v_month_start
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
  'Returns completed-member counts plus operational and sync metrics after a dashboard.read capability check.';

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
    profile.registration_completed_at,
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
  where profile.registration_completed_at is not null
    and (
      normalized_query = ''
      or lower(profile.id::text) like '%' || normalized_query || '%'
      or lower(profile.nickname) like '%' || normalized_query || '%'
      or lower(coalesce(profile.team_id, '')) like '%' || normalized_query || '%'
      or lower(coalesce(team.name, '')) like '%' || normalized_query || '%'
    )
  order by activity.recent_activity_at desc nulls last,
    profile.registration_completed_at desc
  limit safe_limit offset safe_offset;
end;
$$;

revoke all on function public.admin_get_users(text, integer, integer)
  from public, anon;
grant execute on function public.admin_get_users(text, integer, integer)
  to authenticated;

comment on function public.admin_get_users(text, integer, integer) is
  'Returns completed KickON members only; joined_at is the profile setup completion time.';

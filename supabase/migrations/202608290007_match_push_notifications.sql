alter table public.notification_preferences
  add column if not exists goal_notifications_enabled boolean not null default false;

update public.notification_preferences
set
  goal_notifications_enabled = match_notifications_enabled,
  community_notifications_enabled = false;

alter table public.notification_preferences
  alter column community_notifications_enabled set default false;

grant update (goal_notifications_enabled)
  on public.notification_preferences to authenticated;

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
    goal_notifications_enabled = notifications_enabled,
    community_notifications_enabled = false
  where user_id = current_user_id;

  update public.profiles
  set
    signup_consented_at = accepted_at,
    terms_version = terms_document_version,
    privacy_version = privacy_document_version,
    community_policy_version = community_document_version,
    age_confirmed_at = accepted_at,
    registration_completed_at = coalesce(registration_completed_at, accepted_at)
  where id = current_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

create or replace function public.create_fixture_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'LIVE'
    and (tg_op = 'INSERT' or old.status is distinct from 'LIVE') then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '응원팀 경기가 시작됐어요',
      '지금 경기와 팬들의 이야기를 확인해보세요.',
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id),
      'fixture-live:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_fixture_notifications()
  from public, anon, authenticated;

drop trigger if exists comments_create_notification on public.comments;

create or replace function public.create_goal_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_goal_events jsonb := '[]'::jsonb;
  goal_event jsonb;
  scorer_name text;
  minute_label text;
  home_team_name text;
  away_team_name text;
begin
  if tg_op = 'UPDATE' then
    previous_goal_events := coalesce(old.goal_events, '[]'::jsonb);
  end if;

  select team.name into home_team_name
  from public.teams team
  where team.id = new.home_team_id;

  select team.name into away_team_name
  from public.teams team
  where team.id = new.away_team_id;

  for goal_event in
    select candidate.value
    from jsonb_array_elements(coalesce(new.goal_events, '[]'::jsonb)) candidate(value)
    where nullif(candidate.value ->> 'id', '') is not null
      and not exists (
        select 1
        from jsonb_array_elements(previous_goal_events) previous(value)
        where previous.value ->> 'id' = candidate.value ->> 'id'
      )
  loop
    scorer_name := coalesce(
      nullif(goal_event ->> 'scorerNameKo', ''),
      nullif(goal_event ->> 'scorerName', ''),
      '득점'
    );
    minute_label := coalesce(goal_event ->> 'minute', '0');
    if coalesce((goal_event ->> 'addedTime')::integer, 0) > 0 then
      minute_label := minute_label || '+' || (goal_event ->> 'addedTime');
    end if;

    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '⚽ ' || scorer_name || ' 골!',
      coalesce(home_team_name, new.home_team_id)
        || ' ' || coalesce(goal_event ->> 'homeScore', '0')
        || ' : ' || coalesce(goal_event ->> 'awayScore', '0')
        || ' ' || coalesce(away_team_name, new.away_team_id)
        || ' · ' || minute_label || '분',
      jsonb_build_object(
        'tab', 'Fixtures',
        'fixtureId', new.id,
        'goalEventId', goal_event ->> 'id',
        'scoringTeamId', goal_event ->> 'teamId'
      ),
      'fixture-goal:' || new.id || ':' || (goal_event ->> 'id')
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.goal_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  return new;
end;
$$;

revoke all on function public.create_goal_notifications()
  from public, anon, authenticated;

drop trigger if exists fixtures_create_goal_notifications on public.fixtures;
create trigger fixtures_create_goal_notifications
after insert or update of goal_events on public.fixtures
for each row execute function public.create_goal_notifications();

comment on column public.notification_preferences.goal_notifications_enabled is
  'Controls goal push notifications for fixtures involving the supported team.';

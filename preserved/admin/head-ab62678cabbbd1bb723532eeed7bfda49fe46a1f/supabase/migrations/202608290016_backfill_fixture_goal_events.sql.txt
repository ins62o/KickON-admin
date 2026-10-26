alter table public.fixtures
  add column if not exists goal_events_backfilled_at timestamptz;

comment on column public.fixtures.goal_events_backfilled_at is
  'When historical Sportmonks goal events were checked, including scoreless fixtures.';

create or replace function public.create_goal_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_goal_events jsonb := '[]'::jsonb;
  latest_goal_event jsonb;
  goal_event jsonb;
  scorer_name text;
  minute_value integer;
  added_time integer;
  minute_label text;
  home_team_name text;
  away_team_name text;
  score_text text;
  goal_snapshot_matches_score boolean := false;
begin
  -- Historical backfills only update goal_events/backfill metadata. Live sync
  -- always advances live_updated_at in the same write, so old goals can never
  -- fan out as new push notifications.
  if tg_op = 'UPDATE'
    and new.status = 'FINISHED'
    and new.live_updated_at is not distinct from old.live_updated_at
  then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    previous_goal_events := coalesce(old.goal_events, '[]'::jsonb);
  end if;

  select candidate.value
  into latest_goal_event
  from jsonb_array_elements(coalesce(new.goal_events, '[]'::jsonb))
    with ordinality candidate(value, position)
  order by
    coalesce((candidate.value ->> 'sortOrder')::integer, candidate.position::integer) desc,
    candidate.position desc
  limit 1;

  goal_snapshot_matches_score := latest_goal_event is not null
    and (latest_goal_event ->> 'homeScore')::integer = new.home_score
    and (latest_goal_event ->> 'awayScore')::integer = new.away_score;

  select team.name into home_team_name
  from public.teams team
  where team.id = new.home_team_id;

  select team.name into away_team_name
  from public.teams team
  where team.id = new.away_team_id;

  score_text := coalesce(home_team_name, new.home_team_id)
    || ' ' || coalesce(new.home_score::text, '0')
    || ' : ' || coalesce(new.away_score::text, '0')
    || ' ' || coalesce(away_team_name, new.away_team_id);

  if goal_snapshot_matches_score then
    for goal_event in
      select candidate.value
      from jsonb_array_elements(coalesce(new.goal_events, '[]'::jsonb)) candidate(value)
      where nullif(candidate.value ->> 'id', '') is not null
    loop
      scorer_name := coalesce(
        nullif(goal_event ->> 'scorerNameKo', ''),
        nullif(goal_event ->> 'scorerName', ''),
        '득점'
      );
      minute_value := greatest(coalesce((goal_event ->> 'minute')::integer, 0), 0);
      added_time := greatest(coalesce((goal_event ->> 'addedTime')::integer, 0), 0);
      minute_label := minute_value::text;
      if added_time > 0 then
        minute_label := minute_label || '+' || added_time;
      end if;

      insert into public.notifications (
        user_id, type, title, body, data, dedupe_key
      )
      select
        profile.id,
        'MATCH',
        '⚽ ' || scorer_name || ' 골! · ' || minute_label || '''',
        coalesce(home_team_name, new.home_team_id)
          || ' ' || coalesce(goal_event ->> 'homeScore', '0')
          || ' : ' || coalesce(goal_event ->> 'awayScore', '0')
          || ' ' || coalesce(away_team_name, new.away_team_id),
        jsonb_build_object(
          'tab', 'Fixtures',
          'fixtureId', new.id,
          'goalEventId', goal_event ->> 'id',
          'scoringTeamId', goal_event ->> 'teamId',
          'phase', 'GOAL'
        ),
        'fixture-goal:' || new.id || ':' || (goal_event ->> 'id')
      from public.profiles profile
      join public.notification_preferences preference
        on preference.user_id = profile.id
      where profile.team_id in (new.home_team_id, new.away_team_id)
        and preference.goal_notifications_enabled
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    for goal_event in
      select previous.value
      from jsonb_array_elements(previous_goal_events) previous(value)
      where nullif(previous.value ->> 'id', '') is not null
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(new.goal_events, '[]'::jsonb)) candidate(value)
          where candidate.value ->> 'id' = previous.value ->> 'id'
        )
    loop
      scorer_name := coalesce(
        nullif(goal_event ->> 'scorerNameKo', ''),
        nullif(goal_event ->> 'scorerName', ''),
        '해당'
      );

      insert into public.notifications (
        user_id, type, title, body, data, dedupe_key
      )
      select
        profile.id,
        'MATCH',
        '❌ ' || scorer_name || ' 득점이 취소됐어요',
        score_text,
        jsonb_build_object(
          'tab', 'Fixtures',
          'fixtureId', new.id,
          'goalEventId', goal_event ->> 'id',
          'scoringTeamId', goal_event ->> 'teamId',
          'phase', 'GOAL_CANCELLED'
        ),
        'fixture-goal-cancelled:' || new.id || ':' || (goal_event ->> 'id')
      from public.profiles profile
      join public.notification_preferences preference
        on preference.user_id = profile.id
      where profile.team_id in (new.home_team_id, new.away_team_id)
        and preference.goal_notifications_enabled
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.create_goal_notifications()
  from public, anon, authenticated;

comment on function public.create_goal_notifications() is
  'Creates deduplicated live goal pushes while suppressing historical backfill notifications.';

create or replace function public.invoke_fixture_goal_backfill(
  target_limit integer default 500
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  sync_secret text;
  request_id bigint;
begin
  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'kickon_live_football_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'kickon_football_sync_secret'
  limit 1;

  if function_url is null or sync_secret is null then
    raise exception 'KickON live football sync Vault secrets are missing';
  end if;

  select net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', sync_secret
    ),
    body := jsonb_build_object(
      'mode', 'backfill-goals',
      'limit', least(1000, greatest(target_limit, 1))
    ),
    timeout_milliseconds := 60000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_fixture_goal_backfill(integer)
  from public, anon, authenticated;
grant execute on function public.invoke_fixture_goal_backfill(integer)
  to service_role;

comment on function public.invoke_fixture_goal_backfill(integer) is
  'Queues a protected one-time Sportmonks goal-event backfill for finished fixtures.';

-- Missing provider player details must never become a player-specific push.
create or replace function public.fixture_goal_notification_title(
  goal_event jsonb,
  scoring_team_name text,
  cancelled boolean default false
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  scorer_name text;
  own_goal boolean := coalesce((goal_event ->> 'ownGoal')::boolean, false);
  minute_label text := greatest(coalesce((goal_event ->> 'minute')::integer, 0), 0)::text;
  added_time integer := greatest(coalesce((goal_event ->> 'addedTime')::integer, 0), 0);
begin
  select btrim(candidate.name) into scorer_name
  from unnest(array[goal_event ->> 'scorerNameKo', goal_event ->> 'scorerName'])
    with ordinality candidate(name, position)
  where nullif(btrim(candidate.name), '') is not null
    and btrim(candidate.name) !~* '^(unknown([[:space:]]+player)?|player[[:space:]]+[0-9]+|tbd|n/?a)$'
  order by candidate.position limit 1;
  if cancelled then
    return '❌ ' || case when scorer_name is null then '' else scorer_name || ' ' end
      || case when own_goal then '자책골이' else '득점이' end || ' 취소됐어요';
  end if;
  if added_time > 0 then minute_label := minute_label || '+' || added_time; end if;
  return '⚽ ' || case when scorer_name is not null then
    scorer_name || case when own_goal then ' 자책골' else ' 골!' end
    else coalesce(nullif(btrim(scoring_team_name), ''), '해당 팀') || ' 득점!'
      || case when own_goal then ' (자책골)' else '' end end
    || ' · ' || minute_label || '''';
end;
$$;
revoke all on function public.fixture_goal_notification_title(jsonb,text,boolean)
  from public, anon, authenticated;
grant execute on function public.fixture_goal_notification_title(jsonb,text,boolean) to service_role;

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
  is_own_goal boolean;
  home_team_name text;
  away_team_name text;
  score_text text;
  goal_snapshot_matches_score boolean := false;
begin
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
      is_own_goal := coalesce((goal_event ->> 'ownGoal')::boolean, false);

      insert into public.notifications (
        user_id, type, title, body, data, dedupe_key
      )
      select
        profile.id,
        'MATCH',
        public.fixture_goal_notification_title(
          goal_event,
          case when goal_event ->> 'teamId' = new.home_team_id
            then home_team_name else away_team_name end
        ),
        coalesce(home_team_name, new.home_team_id)
          || ' ' || coalesce(goal_event ->> 'homeScore', '0')
          || ' : ' || coalesce(goal_event ->> 'awayScore', '0')
          || ' ' || coalesce(away_team_name, new.away_team_id),
        jsonb_build_object(
          'tab', 'Fixtures',
          'fixtureId', new.id,
          'goalEventId', goal_event ->> 'id',
          'scoringTeamId', goal_event ->> 'teamId',
          'ownGoal', is_own_goal,
          'phase', 'GOAL'
        ),
        'fixture-goal:' || new.id || ':' || (goal_event ->> 'id')
      from public.profiles profile
      join public.notification_preferences preference
        on preference.user_id = profile.id
      where profile.team_id in (new.home_team_id, new.away_team_id)
        and preference.goal_notifications_enabled
      on conflict (user_id, dedupe_key) where dedupe_key is not null
      do update set title = excluded.title, body = excluded.body
      where notifications.title is distinct from excluded.title
        or notifications.body is distinct from excluded.body;
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
      is_own_goal := coalesce((goal_event ->> 'ownGoal')::boolean, false);

      insert into public.notifications (
        user_id, type, title, body, data, dedupe_key
      )
      select
        profile.id,
        'MATCH',
        public.fixture_goal_notification_title(goal_event, null, true),
        score_text,
        jsonb_build_object(
          'tab', 'Fixtures',
          'fixtureId', new.id,
          'goalEventId', goal_event ->> 'id',
          'scoringTeamId', goal_event ->> 'teamId',
          'ownGoal', is_own_goal,
          'phase', 'GOAL_CANCELLED'
        ),
        'fixture-goal-cancelled:' || new.id || ':' || (goal_event ->> 'id')
      from public.profiles profile
      join public.notification_preferences preference
        on preference.user_id = profile.id
      where profile.team_id in (new.home_team_id, new.away_team_id)
        and preference.goal_notifications_enabled
      on conflict (user_id, dedupe_key) where dedupe_key is not null
      do update set title = excluded.title, body = excluded.body
      where notifications.title is distinct from excluded.title
        or notifications.body is distinct from excluded.body;
    end loop;
  end if;

  return new;
end;
$$;
revoke all on function public.create_goal_notifications()
  from public, anon, authenticated;
comment on function public.create_goal_notifications() is
  'Creates one push per goal, uses a team title for unknown scorers, and silently refreshes saved titles as player details arrive.';

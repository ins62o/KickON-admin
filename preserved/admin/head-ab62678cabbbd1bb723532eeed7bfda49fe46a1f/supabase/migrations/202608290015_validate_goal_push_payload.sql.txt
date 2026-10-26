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
    -- Re-evaluate every valid event. The per-user dedupe key keeps this
    -- idempotent while allowing a provider event that was initially malformed
    -- to become eligible after the next corrected snapshot.
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
  'Creates deduplicated goal pushes only after the provider goal snapshot agrees with the fixture score, and handles rescinded goals.';

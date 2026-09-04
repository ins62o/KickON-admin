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
  minute_value integer;
  added_time integer;
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
    minute_value := greatest(coalesce((goal_event ->> 'minute')::integer, 0), 0);
    added_time := greatest(coalesce((goal_event ->> 'addedTime')::integer, 0), 0);
    minute_label := case
      when minute_value <= 45 then '전 ' || minute_value
      when minute_value <= 90 then '후 ' || (minute_value - 45)
      when minute_value <= 105 then '연장 전 ' || (minute_value - 90)
      else '연장 후 ' || (minute_value - 105)
    end;
    if added_time > 0 then
      minute_label := minute_label || '+' || added_time;
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
        || ' · ' || minute_label,
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

comment on function public.create_goal_notifications() is
  'Creates deduplicated goal pushes with compact Korean period labels such as 전 9 and 후 11.';

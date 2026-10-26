create or replace function public.create_fixture_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_period text := upper(regexp_replace(coalesce(new.live_period, ''), '[^A-Za-z0-9]+', '_', 'g'));
  old_period text := case
    when tg_op = 'UPDATE' then upper(regexp_replace(coalesce(old.live_period, ''), '[^A-Za-z0-9]+', '_', 'g'))
    else ''
  end;
  home_team_name text;
  away_team_name text;
  score_text text;
begin
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
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id, 'phase', 'KICKOFF'),
      'fixture-live:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if new.status = 'LIVE'
    and new_period in ('HALF_TIME', 'HALFTIME', 'HT', 'BREAK')
    and old_period not in ('HALF_TIME', 'HALFTIME', 'HT', 'BREAK') then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '⏸️ 전반전이 종료됐어요',
      score_text,
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id, 'phase', 'HALF_TIME'),
      'fixture-halftime:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if new.status = 'LIVE'
    and new_period in ('SECOND_HALF', '2ND_HALF')
    and old_period not in ('SECOND_HALF', '2ND_HALF') then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '▶️ 후반전이 시작됐어요',
      score_text,
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id, 'phase', 'SECOND_HALF'),
      'fixture-second-half:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if new.status = 'FINISHED'
    and (tg_op = 'INSERT' or old.status is distinct from 'FINISHED') then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '🏁 경기가 종료됐어요',
      score_text,
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id, 'phase', 'FULL_TIME'),
      'fixture-finished:' || new.id
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

comment on function public.create_fixture_notifications() is
  'Creates deduplicated kickoff, half-time, second-half, and full-time push notifications.';

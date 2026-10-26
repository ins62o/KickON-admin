alter table public.fixtures
add column if not exists lineup_announced_at timestamptz;

create or replace function public.create_lineup_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lineup_announced_at is not null
    and (
      tg_op = 'INSERT'
      or old.lineup_announced_at is null
      or old.lineup_announced_at is distinct from new.lineup_announced_at
    ) then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'LINEUP',
      '응원팀의 선발 라인업이 공개됐어요',
      '오늘 경기의 선발 명단을 확인해보세요.',
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id),
      'fixture-lineup:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.lineup_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_lineup_notification()
from public, anon, authenticated;

create trigger fixtures_create_lineup_notifications
after insert or update of lineup_announced_at on public.fixtures
for each row execute function public.create_lineup_notification();

create or replace function public.sync_football_data(
  payload_fixtures jsonb,
  payload_standings jsonb,
  payload_scorers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fixtures (
    id,
    league_id,
    round,
    home_team_id,
    away_team_id,
    stadium_id,
    kickoff_at,
    status,
    home_score,
    away_score,
    lineup_announced_at
  )
  select
    fixture.id,
    fixture.league_id,
    fixture.round,
    fixture.home_team_id,
    fixture.away_team_id,
    fixture.stadium_id,
    fixture.kickoff_at,
    fixture.status,
    fixture.home_score,
    fixture.away_score,
    fixture.lineup_announced_at
  from jsonb_to_recordset(coalesce(payload_fixtures, '[]'::jsonb)) as fixture(
    id text,
    league_id text,
    round integer,
    home_team_id text,
    away_team_id text,
    stadium_id text,
    kickoff_at timestamptz,
    status text,
    home_score integer,
    away_score integer,
    lineup_announced_at timestamptz
  )
  on conflict (id) do update set
    league_id = excluded.league_id,
    round = excluded.round,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stadium_id = excluded.stadium_id,
    kickoff_at = excluded.kickoff_at,
    status = excluded.status,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    lineup_announced_at = coalesce(
      excluded.lineup_announced_at,
      fixtures.lineup_announced_at
    );

  insert into public.league_standings (
    season,
    league_id,
    team_id,
    rank,
    played,
    points,
    won,
    drawn,
    lost,
    goals_for,
    goals_against,
    goal_difference,
    updated_at
  )
  select
    standing.season,
    standing.league_id,
    standing.team_id,
    standing.rank,
    standing.played,
    standing.points,
    standing.won,
    standing.drawn,
    standing.lost,
    standing.goals_for,
    standing.goals_against,
    standing.goal_difference,
    now()
  from jsonb_to_recordset(coalesce(payload_standings, '[]'::jsonb)) as standing(
    season integer,
    league_id text,
    team_id text,
    rank integer,
    played integer,
    points integer,
    won integer,
    drawn integer,
    lost integer,
    goals_for integer,
    goals_against integer,
    goal_difference integer
  )
  on conflict (season, league_id, team_id) do update set
    rank = excluded.rank,
    played = excluded.played,
    points = excluded.points,
    won = excluded.won,
    drawn = excluded.drawn,
    lost = excluded.lost,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    goal_difference = excluded.goal_difference,
    updated_at = now();

  insert into public.player_scoring_stats (
    season,
    league_id,
    team_id,
    player_id,
    player_name,
    goals,
    appearances,
    updated_at
  )
  select
    scorer.season,
    scorer.league_id,
    scorer.team_id,
    scorer.player_id,
    scorer.player_name,
    scorer.goals,
    scorer.appearances,
    now()
  from jsonb_to_recordset(coalesce(payload_scorers, '[]'::jsonb)) as scorer(
    season integer,
    league_id text,
    team_id text,
    player_id text,
    player_name text,
    goals integer,
    appearances integer
  )
  on conflict (season, league_id, player_id) do update set
    team_id = excluded.team_id,
    player_name = excluded.player_name,
    goals = excluded.goals,
    appearances = excluded.appearances,
    updated_at = now();

  return jsonb_build_object(
    'fixtures', jsonb_array_length(coalesce(payload_fixtures, '[]'::jsonb)),
    'league_standings', jsonb_array_length(coalesce(payload_standings, '[]'::jsonb)),
    'player_scoring_stats', jsonb_array_length(coalesce(payload_scorers, '[]'::jsonb))
  );
end;
$$;

revoke all on function public.sync_football_data(jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.sync_football_data(jsonb, jsonb, jsonb)
to service_role;

-- Publish a complete lineup and its notification marker in one transaction.
-- Concurrent provider writers serialize on the fixture row; failed replacements
-- roll back to the previous lineup instead of leaving an empty player table.
create or replace function public.publish_fixture_lineup(
  target_fixture_id text,
  target_lineups jsonb,
  target_players jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  home_id text;
  away_id text;
begin
  select home_team_id, away_team_id into home_id, away_id
  from public.fixtures where id = target_fixture_id for update;
  if not found then raise exception 'FIXTURE_NOT_FOUND'; end if;
  if jsonb_typeof(target_lineups) is distinct from 'array'
     or jsonb_typeof(target_players) is distinct from 'array' then
    raise exception 'INVALID_LINEUP_PAYLOAD';
  end if;
  if jsonb_array_length(target_lineups) <> 2
     or (select count(distinct l.team_id) from jsonb_populate_recordset(null::public.fixture_lineups, target_lineups) l
         where l.fixture_id = target_fixture_id and l.team_id in (home_id, away_id)) <> 2
     or exists (select 1 from jsonb_populate_recordset(null::public.fixture_lineup_players, target_players) p
                where p.fixture_id is distinct from target_fixture_id or p.team_id is null or p.team_id not in (home_id, away_id))
     or (select count(distinct p.player_id) from jsonb_populate_recordset(null::public.fixture_lineup_players, target_players) p
         where p.team_id = home_id and p.role = 'STARTER') <> 11
     or (select count(distinct p.player_id) from jsonb_populate_recordset(null::public.fixture_lineup_players, target_players) p
         where p.team_id = away_id and p.role = 'STARTER') <> 11 then
    raise exception 'INCOMPLETE_OR_MISMATCHED_LINEUP';
  end if;

  insert into public.fixture_lineups
  select * from jsonb_populate_recordset(null::public.fixture_lineups, target_lineups)
  on conflict (fixture_id, team_id) do update set
    formation = excluded.formation,
    coach_id = excluded.coach_id,
    coach_name = excluded.coach_name,
    fetched_at = excluded.fetched_at;

  delete from public.fixture_lineup_players where fixture_id = target_fixture_id;
  insert into public.fixture_lineup_players
  select * from jsonb_populate_recordset(null::public.fixture_lineup_players, target_players);

  -- The notification trigger runs only after both complete starting elevens
  -- have been stored, and becomes visible with the same transaction commit.
  update public.fixtures set lineup_announced_at = now()
  where id = target_fixture_id and lineup_announced_at is null
    and status in ('SCHEDULED', 'LIVE')
    and kickoff_at >= now() - interval '3 hours';
end;
$$;
revoke all on function public.publish_fixture_lineup(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_fixture_lineup(text, jsonb, jsonb) to service_role;

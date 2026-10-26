-- Migration 004 was already recorded remotely before its cleanup statement was
-- finalized. Replay the narrowly scoped cleanup under a new migration version.
update public.football_sync_state as state
set last_error = null
where state.season is null
  and state.league_id is null
  and state.sync_key like 'team-squad-2026-%'
  and state.last_error like '%squads/seasons/26894/%'
  and exists (
    select 1
    from public.league_standings as standing
    where standing.season = 2026
      and standing.league_id = 'kleague2'
      and state.sync_key = 'team-squad-2026-' || standing.team_id
  );

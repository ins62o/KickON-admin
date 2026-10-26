-- A legacy K League 2 squad run used the K League 1 provider season (26894)
-- for every K League 2 club. The later scoped sync repaired the data, but the
-- obsolete per-team last_error values continued to mark the dashboard as down.
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

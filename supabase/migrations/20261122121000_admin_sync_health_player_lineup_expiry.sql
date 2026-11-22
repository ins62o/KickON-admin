-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 11:40 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: get_admin_football_sync_health() trusts the 2026-11-19 verified official player stats only
-- until the player's team finishes another match. After the 2026-11-21 round every verified player
-- of the 15 teams that played lost that trust, so 13 players who were not even in the matchday squad
-- were reported as PLAYER_STATS_PROJECTION_MISMATCH. Their app values still equal the verified
-- official values and their Sportmonks snapshots had not changed.
-- Change: a later finished match expires the verification only when the player was in that side's
-- lineup (starter or substitute). When the side has no lineup rows, the match still expires it as
-- before. Nothing else in the function changes.
--
-- Verification on production: a pg_temp copy built from the deployed definition was compared with
-- the deployed function in one statement. All output except the projection check was identical.
-- Projection errors went from kleague 8 / kleague2 25 to 5 / 15. The 13 moved to provider
-- disagreements (8 / 34 -> 11 / 44). The call time stayed the same (260ms vs 267ms; 263ms after the
-- swap). The 20 remaining players appeared on 2026-11-21 and still need an official-record check.
--
-- The patch edits the deployed definition in place and refuses to run unless that definition is the
-- one it was verified against. Definition before: md5 70f649c99c7e546eb52b86e4dd202ffa.
-- Definition after: md5 8ddae6802cfd410a2b585d93ea6cadc9,
-- sha256 4272c6e3a8f66f1a5d69b3d9e670c77b8676e617eddcdee5585040e494ae4de5.

do $patch$ declare d text := pg_get_functiondef('public.get_admin_football_sync_health()'::regprocedure); begin if md5(d) <> '70f649c99c7e546eb52b86e4dd202ffa' then raise exception 'UNEXPECTED_SYNC_HEALTH_DEFINITION %', md5(d); end if; d := replace(d, E'          and coalesce(f.post_match_sync_due_at,f.kickoff_at+interval ''3 hours'')>e.verified_at\n      )\n  ), classified as (', E'          and coalesce(f.post_match_sync_due_at,f.kickoff_at+interval ''3 hours'')>e.verified_at\n          -- Only a match the player was listed for expires the check; a side without a lineup stays conservative.\n          and (exists (select 1 from public.fixture_lineup_players lp\n                where lp.fixture_id=f.id and lp.team_id=e.team_id and lp.player_id=e.player_id)\n            or not exists (select 1 from public.fixture_lineup_players lp\n                where lp.fixture_id=f.id and lp.team_id=e.team_id))\n      )\n  ), classified as ('); if encode(sha256(convert_to(d, 'UTF8')), 'hex') <> '4272c6e3a8f66f1a5d69b3d9e670c77b8676e617eddcdee5585040e494ae4de5' then raise exception 'UNEXPECTED_PATCH_RESULT'; end if; execute d; end $patch$;

-- Rollback (not part of the forward change): restores the exact previous definition.
-- do $rollback$ declare d text := pg_get_functiondef('public.get_admin_football_sync_health()'::regprocedure); begin d := replace(d, E'          and coalesce(f.post_match_sync_due_at,f.kickoff_at+interval ''3 hours'')>e.verified_at\n          -- Only a match the player was listed for expires the check; a side without a lineup stays conservative.\n          and (exists (select 1 from public.fixture_lineup_players lp\n                where lp.fixture_id=f.id and lp.team_id=e.team_id and lp.player_id=e.player_id)\n            or not exists (select 1 from public.fixture_lineup_players lp\n                where lp.fixture_id=f.id and lp.team_id=e.team_id))\n      )\n  ), classified as (', E'          and coalesce(f.post_match_sync_due_at,f.kickoff_at+interval ''3 hours'')>e.verified_at\n      )\n  ), classified as ('); if md5(d) <> '70f649c99c7e546eb52b86e4dd202ffa' then raise exception 'ROLLBACK_RESULT_MISMATCH %', md5(d); end if; execute d; end $rollback$

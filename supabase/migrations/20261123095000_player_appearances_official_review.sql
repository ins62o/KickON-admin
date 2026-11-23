-- Record of a data correction already applied to production (KickON) on 2026-11-23 around 09:50 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
-- Replaying it is refused by its own guard (PLAYER_DRIFT), because the values it expects no longer exist.
--
-- Why: the official reconciliation of 2026-11-23 05:00 listed 20 players for review: no override, app
-- value equal to Sportmonks, but different from the K League official record. For 15 of them only the
-- appearances differ (goals already equal the official value). Our own lineup data cannot settle the
-- count (some sides have no lineup rows and it does not say which substitutes came on), so the
-- official record is used.
-- Change: 15 active appearance overrides with the official value, and both stat tables set to it.
-- The daily reconciliation keeps these overrides on the official value and releases them when
-- Sportmonks matches. No goal values change.
--
-- Verification on production: the guard required each player's app, ranking, official and goal values to
-- be exactly as read on 2026-11-23 and no active appearance override; row counts of 15 at every step
-- and a final check on both tables. Active stat overrides went from 93 to 108; sync integrity errors
-- stayed at none; provider disagreements went from 14 / 62 to 19 / 71 as expected.
-- Not changed: duplicate-identity players (Busan Jang Ho-ik, Gyeongnam Alex), whose squad row has another
-- Sportmonks id without stats, and three goal-count differences (Kim Beom-su, Park Jae-yong, Oh In-pyo).
--
-- Rollback (not part of the change): release the 15 overrides (reason starting with
-- 'K League official record 2026-11-23') and restore the app/ranking values in the values list below.

do $fix$
declare
  v_actor constant uuid := '96f73604-1f9d-4bff-ad3e-7a2e02deffe8'; -- account used for the earlier overrides
  v_count integer;
begin
  create temp table fix_targets(team_id text, player_id text, app_apps integer, official_apps integer) on commit drop;
  insert into fix_targets values
    ('anyang','37563401',10,11), ('daejeon','22889458',17,18), ('pohang','37425064',11,12), ('pohang','37736097',7,8),
    ('ulsan','155680',19,20), ('busan-ipark','321038',12,15), ('daegu','37627633',9,13), ('gimpo','37679588',7,8),
    ('suwon-bluewings','34016602',5,4), ('paju','1486728',15,20), ('paju','29312003',22,23), ('paju','38210508',25,26),
    ('seoul-eland','37561718',27,28), ('gimhae','12447484',4,3), ('gimhae','38211335',0,1);

  select count(*) into v_count
  from fix_targets t
  join public.team_players p on p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad
    and p.appearances = t.app_apps
  join public.player_scoring_stats s on s.season = 2026 and s.league_id = p.league_id and s.team_id = t.team_id
    and s.player_id = t.player_id and s.appearances = t.app_apps
  join public.official_player_stats o on o.season = 2026 and o.league_id = p.league_id and o.team_id = t.team_id
    and o.player_id = t.player_id and o.appearances = t.official_apps and o.goals = p.goals and o.goals = s.goals
  where not exists (select 1 from public.manual_overrides m where m.entity_type = 'player' and m.entity_id = t.player_id
    and m.season = 2026 and m.field_path = 'appearances' and m.released_at is null);
  if v_count <> 15 then raise exception 'PLAYER_DRIFT % of 15', v_count; end if;

  perform public.canonical_membership_lock(2026, player_id) from (select distinct player_id from fix_targets order by player_id) x;

  insert into public.manual_overrides(entity_type, entity_id, season, league_id, field_path, original_value, override_value,
    reason, blocks_sync, created_by, team_scope_id)
  select 'player', t.player_id, 2026, p.league_id, 'appearances', to_jsonb(t.app_apps), to_jsonb(t.official_apps),
    'K League official record 2026-11-23 (kleague.com): ' || t.team_id || ' ' || t.app_apps || ' -> ' || t.official_apps
      || ' appearances, approved correction', true, v_actor, t.team_id
  from fix_targets t
  join public.team_players p on p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad;
  get diagnostics v_count = row_count;
  if v_count <> 15 then raise exception 'OVERRIDE_COUNT %', v_count; end if;

  update public.player_scoring_stats s set appearances = t.official_apps, updated_at = now()
  from fix_targets t where s.season = 2026 and s.team_id = t.team_id and s.player_id = t.player_id;
  get diagnostics v_count = row_count;
  if v_count <> 15 then raise exception 'SCORING_COUNT %', v_count; end if;

  update public.team_players p set appearances = t.official_apps, updated_at = now()
  from fix_targets t where p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad;
  get diagnostics v_count = row_count;
  if v_count <> 15 then raise exception 'SQUAD_COUNT %', v_count; end if;

  select count(*) into v_count
  from fix_targets t
  join public.team_players p on p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad
  join public.player_scoring_stats s on s.season = 2026 and s.league_id = p.league_id and s.team_id = t.team_id and s.player_id = t.player_id
  where p.appearances = t.official_apps and s.appearances = t.official_apps;
  if v_count <> 15 then raise exception 'FINAL_CHECK % of 15', v_count; end if;
end
$fix$;

-- Record of a data correction already applied to production (KickON) on 2026-11-23 10:02 KST through the
-- SQL Editor. This file is a record, not an approval to run it (see README.md).
-- Replaying it is refused by its own guard (PLAYER_DRIFT), because the values it expects no longer exist.
--
-- Why: the last 5 of the 20 review players of the 2026-11-23 official reconciliation.
-- Goals (3): the official per-match events of all 60 finished Jeonnam and Seoul E-Land games were read; they
-- add up to every final score. Two stored goal events differ from them:
--   2026-07-05 Jeonnam 3-3 Busan 17' (sportmonks-19676410): stored as an own goal by Kim Beom-su, official goal;
--   2026-10-18 Seoul E 6-2 Gimhae 24' (sportmonks-19676307): stored as Oh In-pyo, official Park Jae-yong.
-- Appearances (2): Sportmonks has two ids for Busan Jang Ho-ik (750497 in the squad, 321195 with the record)
-- and Gyeongnam Alex (38211354 in the squad, 37667225 with the record). Official profile, date of birth and
-- shirt number match. The squad rows had no appearances and no shirt number.
-- Change: 7 active overrides (3 goals, 2 appearances, 2 shirt numbers) with the official value, and both stat
-- tables set to it. The daily reconciliation keeps the stat overrides on the official value; the shirt number
-- overrides are fixed until released.
--
-- Verification on production: the guard required every value to be exactly as read; row counts of 5/7/5/5
-- and a final check on both tables. Active appearance/goal overrides went from 108 to 113; no in-squad player
-- differs from official_player_stats any more; sync integrity errors stayed at none; provider
-- disagreements went from 19 / 71 to 19 / 74 as expected.
-- Not changed: the two goal events in public.fixtures (direct writes are blocked by the m02c gate; the repair
-- RPC goal_only_safe_repair needs a signed-in administrator), the squad membership of the duplicate ids, and
-- the rows of the ids with the record.
--
-- Rollback (not part of the change): release the 7 overrides created at 2026-11-23 01:02:34Z (reason starting
-- with 'K League official record 2026-11-23') and restore the app values in the values list below.

do $fix$
declare
  v_actor constant uuid := '96f73604-1f9d-4bff-ad3e-7a2e02deffe8'; -- account used for the earlier overrides
  v_count integer;
begin
  create temp table fix_players(team_id text, player_id text, app_apps integer, app_goals integer,
    official_apps integer, official_goals integer, official_shirt integer) on commit drop;
  insert into fix_players values
    ('jeonnam','320291',28,1,28,2,null), ('seoul-eland','37620364',30,11,30,12,null), ('seoul-eland','12789439',28,3,28,2,null),
    ('busan-ipark','750497',0,0,27,0,77), ('gyeongnam','38211354',0,0,5,0,29);

  select count(*) into v_count
  from fix_players t
  join public.team_players p on p.season = 2026 and p.league_id = 'kleague2' and p.team_id = t.team_id and p.player_id = t.player_id
    and p.in_squad and not p.manual_lock and p.appearances = t.app_apps and p.goals = t.app_goals
    and (t.official_shirt is null or p.shirt_number is null)
  join public.player_scoring_stats s on s.season = 2026 and s.league_id = p.league_id and s.team_id = t.team_id
    and s.player_id = t.player_id and s.appearances = t.app_apps and s.goals = t.app_goals
  join public.official_player_stats o on o.season = 2026 and o.league_id = p.league_id and o.team_id = t.team_id
    and o.player_id = t.player_id and o.appearances = t.official_apps and o.goals = t.official_goals
  where not exists (select 1 from public.manual_overrides m where m.entity_type = 'player' and m.entity_id = t.player_id
    and m.season = 2026 and m.league_id = 'kleague2' and m.field_path in ('appearances','goals','shirt_number') and m.released_at is null);
  if v_count <> 5 then raise exception 'PLAYER_DRIFT % of 5', v_count; end if;

  perform public.canonical_membership_lock(2026, player_id) from (select player_id from fix_players order by player_id) x;

  insert into public.manual_overrides(entity_type, entity_id, season, league_id, field_path, original_value, override_value,
    reason, blocks_sync, created_by, team_scope_id)
  select 'player', t.player_id, 2026, 'kleague2', f.field, f.before_value, f.after_value,
    'K League official record 2026-11-23 (kleague.com): ' || t.team_id || ' ' || f.field || ' '
      || coalesce(f.before_value #>> '{}', 'none') || ' -> ' || (f.after_value #>> '{}') || ', approved correction',
    true, v_actor, t.team_id
  from fix_players t
  cross join lateral (values
    ('appearances', to_jsonb(t.app_apps), to_jsonb(t.official_apps)),
    ('goals', to_jsonb(t.app_goals), to_jsonb(t.official_goals)),
    ('shirt_number', 'null'::jsonb, to_jsonb(t.official_shirt))) as f(field, before_value, after_value)
  where f.after_value is not null and f.before_value is distinct from f.after_value;
  get diagnostics v_count = row_count;
  if v_count <> 7 then raise exception 'OVERRIDE_COUNT %', v_count; end if;

  update public.player_scoring_stats s set appearances = t.official_apps, goals = t.official_goals, updated_at = now()
  from fix_players t where s.season = 2026 and s.league_id = 'kleague2' and s.team_id = t.team_id and s.player_id = t.player_id;
  get diagnostics v_count = row_count;
  if v_count <> 5 then raise exception 'SCORING_COUNT %', v_count; end if;

  update public.team_players p set appearances = t.official_apps, goals = t.official_goals,
    shirt_number = coalesce(t.official_shirt, p.shirt_number), updated_at = now()
  from fix_players t where p.season = 2026 and p.league_id = 'kleague2' and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad;
  get diagnostics v_count = row_count;
  if v_count <> 5 then raise exception 'SQUAD_COUNT %', v_count; end if;

  select count(*) into v_count
  from fix_players t
  join public.team_players p on p.season = 2026 and p.league_id = 'kleague2' and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad
  join public.player_scoring_stats s on s.season = 2026 and s.league_id = p.league_id and s.team_id = t.team_id and s.player_id = t.player_id
  where p.appearances = t.official_apps and p.goals = t.official_goals and s.appearances = t.official_apps and s.goals = t.official_goals
    and (t.official_shirt is null or p.shirt_number = t.official_shirt);
  if v_count <> 5 then raise exception 'FINAL_CHECK % of 5', v_count; end if;
end
$fix$;

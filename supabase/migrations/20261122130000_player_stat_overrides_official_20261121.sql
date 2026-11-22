-- Record of a data correction already applied to production (KickON) on 2026-11-22 at 12:03 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
-- Replaying it is refused by its own guard (OVERRIDE_DRIFT), because the override values it expects
-- no longer exist.
--
-- Why: the player_scoring_stats and team_players triggers pin appearances/goals to active
-- manual_overrides. Most of these were created on 2026-10-07 from K League official records. After
-- the 2026-11-21 round, 15 players who played were one appearance short of the official record
-- (kleague.com POST /record/selectPersonalRecordByClub.do, read 2026-11-22), and Luis (suwon-bluewings)
-- was also two goals short.
-- Change: release 9 overrides (8 players) whose Sportmonks values now equal the official record. Move
-- 7 appearance overrides to the official value where Sportmonks is still wrong. Set both stat tables
-- of the 15 players to the official values. The release mirrors release_player_manual_override
-- (released_by = the account that created the overrides), because that RPC needs a signed-in admin
-- session. apply_player_manual_override does not support appearances/goals.
--
-- Verification on production: every step checked its row count (9 released, 7 updated, 15 + 15 stat
-- rows) and a final check confirmed both tables equal the official values. Active stat overrides
-- went from 126 to 117. Projection errors went from kleague 5 / kleague2 15 to 2 / 10. The 12 left
-- have app values equal to the official record while Sportmonks differs, and need the verified list
-- in get_admin_football_sync_health.
-- The first run aborted on its guard (an integer cast evaluated on unrelated override rows) and
-- changed nothing. The guard was switched to a text comparison and the second run below succeeded.
--
-- Rollback (not part of the change): set released_at, released_by and release_reason back to null and
-- blocks_sync = true for the 9 released ids; restore override_value to current_value for the 7
-- updated ids. Correct stats would then be pinned back to the earlier (stale) values.

do $fix$
declare
  v_actor constant uuid := '96f73604-1f9d-4bff-ad3e-7a2e02deffe8'; -- account that created the 2026-10-07 overrides
  v_note constant text := 'K League official record 2026-11-22 (kleague.com) after 2026-11-21 round';
  r record;
  v_count integer;
begin
  -- id, team, player, field, current override value, action, official appearances, official goals
  create temp table fix_targets(id uuid, team_id text, player_id text, field text, current_value int, action text, apps int, goals int) on commit drop;
  insert into fix_targets values
    ('9f05831b-79cc-499a-a3ce-b6b48f697ea3','anyang','320896','appearances',17,'release',18,1),
    ('4a851a68-7a2b-4008-ac83-fb9296fc898c','busan-ipark','37700506','appearances',18,'release',19,1),
    ('21f4b3d6-b4b3-44b0-b78c-98c386f25027','chungbuk-cheongju','321305','appearances',26,'release',27,0),
    ('6cb4eeb1-d1b3-42c2-bf1a-f390dc652e06','gimpo','310028','appearances',26,'release',27,3),
    ('15dbfad5-1756-470c-9608-4b50229c94b7','pohang','37563500','appearances',29,'release',30,1),
    ('c5fdc2a2-7d88-462e-83b3-3b1e87f139f8','seoul','37686581','appearances',4,'release',5,0),
    ('c7d961e6-970b-4d6b-a3d0-d267ed7c8379','suwon-bluewings','37620501','appearances',21,'release',22,0),
    ('71fbec62-e071-401b-8a55-4fe940469216','suwon-bluewings','786778','appearances',8,'release',9,7),
    ('f5d2731d-d3eb-4240-800e-18ee0a063d2b','suwon-bluewings','786778','goals',5,'release',9,7),
    ('7b31f685-4a6c-41e3-a100-90c381368b91','chungbuk-cheongju','37620502','appearances',27,'update',28,1),
    ('2c123c29-5fa7-48cd-874b-0d976033009a','chungbuk-cheongju','37735407','appearances',26,'update',27,1),
    ('d213c89c-b1c0-4d74-9dcd-7cb384bcf756','gyeongnam','37677950','appearances',20,'update',21,2),
    ('cac4d359-3114-4e58-87a1-9dff1ae9642a','seongnam','37905628','appearances',6,'update',7,0),
    ('58977383-669c-47f5-ab9b-0a63c5fce445','seongnam','37918816','appearances',18,'update',19,2),
    ('8e8b0251-e372-44e7-84c1-3eab1a71819b','yongin','37735950','appearances',28,'update',29,1),
    ('37af6df5-0e2d-4c27-8d73-e1ecf8203bb2','yongin','38210519','appearances',10,'update',11,0);

  -- Guard: every override is still active with the value read on 2026-11-22.
  select count(*) into v_count from fix_targets t join public.manual_overrides o on o.id = t.id
  where o.entity_type = 'player' and o.entity_id = t.player_id and o.season = 2026 and o.team_scope_id = t.team_id
    and o.field_path = t.field and o.released_at is null and o.blocks_sync
    and o.override_value #>> '{}' = t.current_value::text;
  if v_count <> 16 then raise exception 'OVERRIDE_DRIFT % of 16', v_count; end if;

  -- Same lock order as the override RPCs.
  for r in select distinct player_id from fix_targets order by player_id loop
    perform public.canonical_membership_lock(2026, r.player_id);
  end loop;

  -- Release: mirrors release_player_manual_override (that RPC needs a signed-in admin session).
  update public.manual_overrides o set released_by = v_actor, released_at = now(),
    release_reason = 'Sportmonks now matches the ' || v_note, blocks_sync = false, updated_at = now()
  from fix_targets t where o.id = t.id and t.action = 'release';
  get diagnostics v_count = row_count;
  if v_count <> 9 then raise exception 'RELEASE_COUNT %', v_count; end if;

  -- Update: keep the override, move it to the official value.
  update public.manual_overrides o set override_value = to_jsonb(t.apps), updated_at = now(),
    reason = o.reason || ' | ' || t.current_value || ' -> ' || t.apps || ' appearances, ' || v_note
  from fix_targets t where o.id = t.id and t.action = 'update';
  get diagnostics v_count = row_count;
  if v_count <> 7 then raise exception 'UPDATE_COUNT %', v_count; end if;

  -- Correct the stats now (15 players).
  update public.player_scoring_stats s set appearances = t.apps, goals = t.goals, updated_at = now()
  from (select distinct team_id, player_id, apps, goals from fix_targets) t
  where s.season = 2026 and s.team_id = t.team_id and s.player_id = t.player_id;
  get diagnostics v_count = row_count;
  if v_count <> 15 then raise exception 'SCORING_COUNT %', v_count; end if;

  update public.team_players p set appearances = t.apps, goals = t.goals, updated_at = now()
  from (select distinct team_id, player_id, apps, goals from fix_targets) t
  where p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad;
  get diagnostics v_count = row_count;
  if v_count <> 15 then raise exception 'SQUAD_COUNT %', v_count; end if;

  -- Final check: both tables now equal the official values.
  select count(*) into v_count from (select distinct team_id, player_id, apps, goals from fix_targets) t
  join public.player_scoring_stats s on s.season = 2026 and s.team_id = t.team_id and s.player_id = t.player_id
  join public.team_players p on p.season = 2026 and p.team_id = t.team_id and p.player_id = t.player_id and p.in_squad
  where (s.appearances, s.goals) = (t.apps, t.goals) and (p.appearances, p.goals) = (t.apps, t.goals);
  if v_count <> 15 then raise exception 'FINAL_CHECK % of 15', v_count; end if;
end
$fix$;

-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 13:40 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: 117 active appearance/goal manual_overrides pinned stats to fixed values, so every new
-- matchday left players short of the K League official record (15 players after 2026-11-21).
-- Change: the pieces of a daily reconciliation with the official per-club records:
--   * public.official_player_stats (RLS on, no anon/authenticated access)
--   * admin_official_stats_context / admin_apply_official_player_stats (service_role only), used by the
--     reconcile-official-player-stats Edge Function; runs are recorded in sync_runs
--   * admin_schedule_official_player_stats, the pg_cron caller (cron job: see the follow-up note below)
--   * admin_sync_task_family: cron-history-retention and official-player-stats get their own families
--   * get_admin_football_sync_health: an official record observed after the player's last lineup counts
--     as verified (official first, then the hard-coded list)
--
-- Verification on production: before applying, session-temporary copies showed the health output
-- identical with an empty official table and with 20 official rows, and the apply RPC (report mode) kept
-- the 13 overrides corrected earlier with nothing to release, update or review. After applying:
-- integrity errors none, provider disagreements kleague 13 / kleague2 54 (unchanged); anon and
-- authenticated have no table or function access; service_role can execute.
--
-- Definitions after: get_admin_football_sync_health md5 0960e653c3559ae2e952ea23b913680c (before
-- 977d9be9ed067c03f1bd9d1de776a820); admin_sync_task_family md5 3b77ba8f8b4798b0dd0626b042e62697.
-- Follow-up on 2026-11-22, same session: the Edge Function reconcile-official-player-stats was deployed
-- (--no-verify-jwt; wrong or missing secret returns 401). The first report-only run matched nobody: the
-- K League site serves the English record to non-Korean regions and leaves non-English names empty, so
-- the function now opens a session and switches it to Korean first. The second report-only run (13:48 KST)
-- read 29 clubs and matched 915 players (146 unmatched official rows, 3 ambiguous): 23 overrides to
-- release, 11 to update, 81 already official, 20 players for review. Nothing was changed by either run.
-- At about 13:50 KST the daily job was scheduled (jobid 19, 05:00 KST):
--   select cron.schedule('kickon-official-player-stats', '0 20 * * *', 'select public.admin_schedule_official_player_stats()');
--
-- Rollback (not part of the change): select cron.unschedule('kickon-official-player-stats'); drop the three new functions and the table, and restore the two
-- patched functions from the records 20261122131500 and the previous admin_sync_task_family.

do $guard$
begin
  if to_regclass('public.official_player_stats') is not null then raise exception 'OFFICIAL_TABLE_EXISTS'; end if;
  if md5(pg_get_functiondef('public.get_admin_football_sync_health()'::regprocedure)) <> '977d9be9ed067c03f1bd9d1de776a820' then
    raise exception 'SYNC_HEALTH_DRIFT';
  end if;
end
$guard$;

create table public.official_player_stats (
  season integer not null,
  league_id text not null check (league_id in ('kleague', 'kleague2')),
  team_id text not null,
  player_id text not null check (player_id ~ '^[1-9][0-9]*$'),
  appearances integer not null check (appearances between 0 and 999),
  goals integer not null check (goals between 0 and 999),
  official_player_id text,
  official_name text not null,
  observed_at timestamptz not null,
  primary key (season, league_id, team_id, player_id)
);
alter table public.official_player_stats enable row level security;
revoke all on public.official_player_stats from public, anon, authenticated;

-- Squad players the Edge Function matches official rows against.
create function public.admin_official_stats_context(p_season integer)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  return jsonb_build_object('players', coalesce((
    select jsonb_agg(jsonb_build_object('league_id', p.league_id, 'team_id', p.team_id, 'player_id', p.player_id,
      'name_ko', nullif(btrim(p.display_name_ko), ''), 'shirt_number', p.shirt_number) order by p.team_id, p.player_id)
    from public.team_players p
    where p.season = p_season and p.in_squad and p.league_id in ('kleague', 'kleague2')
  ), '[]'::jsonb));
end;
$fn$;

-- Stores the official values and aligns appearance/goal overrides with them:
--   override + Sportmonks already equals official  -> release the override
--   override differs from official                 -> move the override to the official value
-- Both stat tables of overridden players are set to the official value. Players without an override whose
-- app value differs are only reported ("review"). p_apply = false reports without writing anything except
-- the run record. p_error records a failed read and changes nothing else.
create function public.admin_apply_official_player_stats(p_season integer, p_rows jsonb, p_apply boolean,
  p_unmatched integer, p_ambiguous integer, p_error text)
returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare
  v_now timestamptz := now();
  v_day text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD');
  v_env text := coalesce((select run.environment from public.sync_runs run order by run.created_at desc limit 1), 'production');
  v_summary jsonb;
  v_player record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_season is null or p_season not between 2000 and 2100 or jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array'
    or p_apply is null or coalesce(p_unmatched, -1) < 0 or coalesce(p_ambiguous, -1) < 0 then
    raise exception 'INVALID_OFFICIAL_STATS';
  end if;
  if p_error is not null then
    insert into public.sync_runs(job_key, target_type, target_id, trigger_type, environment, status, started_at, finished_at,
      error_code, error_message, metadata)
    values ('official-player-stats:' || p_season, 'season', p_season::text, 'cron', v_env, 'failed', v_now, v_now,
      left(p_error, 80), '공식 기록을 읽지 못해 아무것도 바꾸지 않았어요', jsonb_build_object('applied', false));
    return jsonb_build_object('applied', false, 'error', left(p_error, 80));
  end if;

  create temp table official_input on commit drop as
  select x.league_id, x.team_id, x.player_id, x.appearances, x.goals, x.official_player_id, btrim(x.official_name) as official_name
  from jsonb_to_recordset(p_rows) x(league_id text, team_id text, player_id text, appearances integer, goals integer,
    official_player_id text, official_name text)
  where x.league_id in ('kleague', 'kleague2') and x.player_id ~ '^[1-9][0-9]*$'
    and x.appearances between 0 and 999 and x.goals between 0 and 999 and coalesce(btrim(x.official_name), '') <> '';
  if (select count(*) from official_input) <> jsonb_array_length(p_rows)
    or exists (select 1 from official_input group by league_id, team_id, player_id having count(*) > 1) then
    raise exception 'INVALID_OFFICIAL_ROWS';
  end if;

  create temp table official_decisions on commit drop as
  with fields as (
    select i.*, f.field, case f.field when 'appearances' then i.appearances else i.goals end as official_value
    from official_input i cross join (values ('appearances'), ('goals')) f(field)
  ), joined as (
    select fl.*, o.id as override_id, (o.override_value #>> '{}')::integer as override_value,
      (select case when s.comparable_value #>> array['statistics', fl.field, 'state'] = 'observed'
          and s.comparable_value #>> array['statistics', fl.field, 'value'] ~ '^[0-9]{1,6}$'
          then (s.comparable_value #>> array['statistics', fl.field, 'value'])::integer end
        from public.provider_entity_snapshots s
        where s.provider = 'sportmonks' and s.entity_type = 'player' and s.season = p_season and s.league_id = fl.league_id
          and s.entity_id = fl.league_id || ':' || fl.team_id || ':' || fl.player_id and s.provider_entity_id = fl.player_id
        order by s.fetched_at desc, s.id desc limit 1) as provider_value,
      (select case fl.field when 'appearances' then ps.appearances else ps.goals end
        from public.player_scoring_stats ps
        where ps.season = p_season and ps.league_id = fl.league_id and ps.team_id = fl.team_id and ps.player_id = fl.player_id) as app_value
    from fields fl
    left join public.manual_overrides o on o.entity_type = 'player' and o.entity_id = fl.player_id and o.season = p_season
      and o.league_id = fl.league_id and o.team_scope_id = fl.team_id and o.field_path = fl.field
      and o.released_at is null and o.blocks_sync
  )
  select j.*, case
      when j.override_id is not null and j.provider_value is not distinct from j.official_value then 'release'
      when j.override_id is not null and j.override_value is distinct from j.official_value then 'update'
      when j.override_id is not null then 'keep'
      when j.app_value is not null and j.app_value <> j.official_value then 'review'
      else 'ok'
    end as action
  from joined j;

  if p_apply then
    for v_player in select distinct d.player_id from official_decisions d where d.action in ('release', 'update', 'keep') order by d.player_id loop
      perform public.canonical_membership_lock(p_season, v_player.player_id);
    end loop;

    insert into public.official_player_stats(season, league_id, team_id, player_id, appearances, goals, official_player_id, official_name, observed_at)
    select p_season, i.league_id, i.team_id, i.player_id, i.appearances, i.goals, i.official_player_id, i.official_name, v_now
    from official_input i
    on conflict (season, league_id, team_id, player_id) do update set
      appearances = excluded.appearances, goals = excluded.goals, official_player_id = excluded.official_player_id,
      official_name = excluded.official_name, observed_at = excluded.observed_at;

    update public.manual_overrides o set released_at = v_now, blocks_sync = false, updated_at = v_now,
      release_reason = 'Sportmonks matches the K League official record (' || v_day || ')'
    from official_decisions d where d.action = 'release' and o.id = d.override_id;

    update public.manual_overrides o set override_value = to_jsonb(d.official_value), updated_at = v_now,
      reason = split_part(o.reason, ' | ', 1) || ' | K League official record ' || v_day || ': ' || d.field || ' '
        || d.override_value || ' -> ' || d.official_value
    from official_decisions d where d.action = 'update' and o.id = d.override_id;

    with target as (
      select d.league_id, d.team_id, d.player_id,
        max(d.official_value) filter (where d.field = 'appearances') as appearances,
        max(d.official_value) filter (where d.field = 'goals') as goals
      from official_decisions d where d.action in ('release', 'update', 'keep')
      group by d.league_id, d.team_id, d.player_id
    )
    update public.player_scoring_stats ps set appearances = coalesce(t.appearances, ps.appearances),
      goals = coalesce(t.goals, ps.goals), updated_at = v_now
    from target t
    where ps.season = p_season and ps.league_id = t.league_id and ps.team_id = t.team_id and ps.player_id = t.player_id
      and (ps.appearances, ps.goals) is distinct from (coalesce(t.appearances, ps.appearances), coalesce(t.goals, ps.goals));

    with target as (
      select d.league_id, d.team_id, d.player_id,
        max(d.official_value) filter (where d.field = 'appearances') as appearances,
        max(d.official_value) filter (where d.field = 'goals') as goals
      from official_decisions d where d.action in ('release', 'update', 'keep')
      group by d.league_id, d.team_id, d.player_id
    )
    update public.team_players tp set appearances = coalesce(t.appearances, tp.appearances),
      goals = coalesce(t.goals, tp.goals), updated_at = v_now
    from target t
    where tp.season = p_season and tp.league_id = t.league_id and tp.team_id = t.team_id and tp.player_id = t.player_id
      and tp.in_squad
      and (tp.appearances, tp.goals) is distinct from (coalesce(t.appearances, tp.appearances), coalesce(t.goals, tp.goals));
  end if;

  select jsonb_build_object('applied', p_apply, 'matched', (select count(*) from official_input),
      'released', count(*) filter (where d.action = 'release'), 'updated', count(*) filter (where d.action = 'update'),
      'kept', count(*) filter (where d.action = 'keep'), 'review', count(*) filter (where d.action = 'review'),
      'unmatched', p_unmatched, 'ambiguous', p_ambiguous,
      'review_players', coalesce(jsonb_agg(jsonb_build_object('team_id', d.team_id, 'player_id', d.player_id,
        'name', d.official_name, 'field', d.field, 'app', d.app_value, 'official', d.official_value)
        order by d.team_id, d.player_id, d.field) filter (where d.action = 'review'), '[]'::jsonb))
  into v_summary from official_decisions d;

  insert into public.sync_runs(job_key, target_type, target_id, trigger_type, environment, status, started_at, finished_at,
    updated_count, skipped_count, failed_count, reason, metadata)
  values ('official-player-stats:' || p_season, 'season', p_season::text, 'cron', v_env,
    case when (v_summary ->> 'review')::integer > 0 or p_ambiguous > 0 then 'partial' else 'succeeded' end::public.sync_run_status,
    v_now, clock_timestamp(),
    (v_summary ->> 'released')::integer + (v_summary ->> 'updated')::integer, (v_summary ->> 'review')::integer, p_ambiguous,
    case when p_apply then null else '보고 전용 실행이라 아무것도 바꾸지 않았어요' end, v_summary);
  return v_summary;
end;
$fn$;

-- pg_cron entry point, same Vault secrets as admin_schedule_resource_collection.
create function public.admin_schedule_official_player_stats()
returns bigint language plpgsql security definer set search_path to '' as $fn$
declare project_url text; token text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'kickon_monitoring_project_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'kickon_monitoring_cron_secret';
  if project_url is null or token is null then raise exception 'Monitoring is not configured'; end if;
  return net.http_post(url := project_url || '/functions/v1/reconcile-official-player-stats',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := '{"apply":true}'::jsonb, timeout_milliseconds := 60000);
end;
$fn$;

revoke all on function public.admin_official_stats_context(integer) from public, anon, authenticated;
revoke all on function public.admin_apply_official_player_stats(integer, jsonb, boolean, integer, integer, text) from public, anon, authenticated;
revoke all on function public.admin_schedule_official_player_stats() from public, anon, authenticated;
grant execute on function public.admin_official_stats_context(integer) to service_role;
grant execute on function public.admin_apply_official_player_stats(integer, jsonb, boolean, integer, integer, text) to service_role;

-- Sync history families: keep the retention and reconciliation jobs out of "history".
do $family$
declare d text := pg_get_functiondef('public.admin_sync_task_family(text)'::regprocedure);
begin
  if position($a$when p_key ~ 'history' then 'history'$a$ in d) = 0 then raise exception 'FAMILY_ANCHOR_MISSING'; end if;
  d := replace(d, $a$when p_key ~ 'history' then 'history'$a$,
    $b$when p_key ~ 'cron-history-retention' then 'cron-retention' when p_key ~ 'official-player-stats' then 'official-stats' when p_key ~ 'history' then 'history'$b$);
  execute d;
end
$family$;

-- Sync health: an official record observed after the player's last lineup counts as verified, like the
-- hard-coded list (official first). Expiry follows the same lineup rule.
do $health$
declare d text := pg_get_functiondef('public.get_admin_football_sync_health()'::regprocedure);
  a1 constant text := E'  ), classified as (';
  a2 constant text := E'    left join verified_current e on (e.league_id,e.team_id,e.player_id,e.snapshot_hash,e.dob)=\n          (r.league_id,r.team_id,r.player_id,r.snapshot_hash,r.squad_dob)\n';
begin
  if (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 or (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 then
    raise exception 'HEALTH_ANCHOR_COUNT';
  end if;
  d := replace(d, a1, E'  ), official_current as materialized (\n'
    || E'    select o.* from public.official_player_stats o\n'
    || E'    where o.season=current_season and o.observed_at<=now()\n'
    || E'      and not exists (\n'
    || E'        select 1 from public.fixtures f where f.league_id=o.league_id and f.status=''FINISHED''\n'
    || E'          and (f.home_team_id=o.team_id or f.away_team_id=o.team_id)\n'
    || E'          and f.kickoff_at>=make_timestamptz(o.season,1,1,0,0,0,''Asia/Seoul'')\n'
    || E'          and coalesce(f.post_match_sync_due_at,f.kickoff_at+interval ''3 hours'')>o.observed_at\n'
    || E'          and (exists (select 1 from public.fixture_lineup_players lp\n'
    || E'                where lp.fixture_id=f.id and lp.team_id=o.team_id and lp.player_id=o.player_id)\n'
    || E'            or not exists (select 1 from public.fixture_lineup_players lp\n'
    || E'                where lp.fixture_id=f.id and lp.team_id=o.team_id))\n'
    || E'      )\n'
    || a1);
  d := replace(d, a2, E'    left join lateral (\n'
    || E'      select v.player_id, v.appearances, v.goals from (\n'
    || E'        select 1 as priority, o.player_id, o.appearances, o.goals from official_current o\n'
    || E'        where (o.league_id,o.team_id,o.player_id)=(r.league_id,r.team_id,r.player_id)\n'
    || E'        union all\n'
    || E'        select 2, e.player_id, e.appearances, e.goals from verified_current e\n'
    || E'        where (e.league_id,e.team_id,e.player_id,e.snapshot_hash,e.dob)=(r.league_id,r.team_id,r.player_id,r.snapshot_hash,r.squad_dob)\n'
    || E'      ) v order by v.priority limit 1\n'
    || E'    ) e on true\n');
  execute d;
end
$health$;

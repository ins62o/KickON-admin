-- KICKON Data Center: pre-sync Provider player movement candidates.
-- Apply after 202609050006. This reuses player_change_events from 202609050002.

create or replace function public.ingest_provider_player_change_candidates(
  p_provider text,
  p_source_reference text,
  p_sync_run_id uuid,
  p_candidates jsonb
)
returns table (
  accepted_count integer,
  created_count integer,
  existing_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate jsonb;
  normalized_provider text := lower(trim(coalesce(p_provider, '')));
  candidate_dedupe text;
  candidate_player_id text;
  candidate_player_name text;
  candidate_from_team_id text;
  candidate_to_team_id text;
  candidate_from_team_name text;
  candidate_to_team_name text;
  candidate_change_type text;
  candidate_movement_date date;
  candidate_observed_at timestamptz;
  candidate_before_value jsonb;
  candidate_after_value jsonb;
  existing_event_id uuid;
  reflected_now boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if normalized_provider <> 'sportmonks' then
    raise exception 'UNSUPPORTED_CHANGE_PROVIDER';
  end if;
  if p_candidates is null
    or jsonb_typeof(p_candidates) <> 'array'
    or jsonb_array_length(p_candidates) < 1
    or jsonb_array_length(p_candidates) > 100 then
    raise exception 'INVALID_CHANGE_CANDIDATE_BATCH';
  end if;
  if char_length(coalesce(p_source_reference, '')) > 500 then
    raise exception 'INVALID_CHANGE_SOURCE';
  end if;
  if p_sync_run_id is not null and not exists (
    select 1 from public.sync_runs run where run.id = p_sync_run_id
  ) then
    raise exception 'SYNC_RUN_NOT_FOUND';
  end if;

  accepted_count := jsonb_array_length(p_candidates);
  created_count := 0;
  existing_count := 0;

  -- Stable ordering prevents advisory-lock inversion across concurrent batches.
  for candidate in
    select item.value
    from jsonb_array_elements(p_candidates) item(value)
    order by item.value ->> 'dedupeKey'
  loop
    if jsonb_typeof(candidate) <> 'object' then
      raise exception 'INVALID_CHANGE_CANDIDATE';
    end if;

    candidate_dedupe := lower(trim(coalesce(candidate ->> 'dedupeKey', '')));
    candidate_player_id := trim(coalesce(candidate ->> 'playerId', ''));
    candidate_player_name := trim(coalesce(candidate ->> 'playerName', ''));
    candidate_from_team_id := nullif(trim(coalesce(candidate ->> 'fromTeamId', '')), '');
    candidate_to_team_id := nullif(trim(coalesce(candidate ->> 'toTeamId', '')), '');
    candidate_from_team_name := nullif(trim(coalesce(candidate ->> 'fromTeamName', '')), '');
    candidate_to_team_name := nullif(trim(coalesce(candidate ->> 'toTeamName', '')), '');
    candidate_change_type := trim(coalesce(candidate ->> 'changeType', ''));
    candidate_movement_date := case
      when coalesce(candidate ->> 'movementDate', '') = '' then null
      else (candidate ->> 'movementDate')::date
    end;
    candidate_observed_at := (candidate ->> 'observedAt')::timestamptz;
    candidate_before_value := coalesce(candidate -> 'beforeValue', 'null'::jsonb);
    candidate_after_value := coalesce(candidate -> 'afterValue', 'null'::jsonb);

    if candidate_dedupe !~ '^[a-f0-9]{64}$'
      or candidate_player_id !~ '^[A-Za-z0-9._:-]{1,160}$'
      or char_length(candidate_player_name) < 1
      or char_length(candidate_player_name) > 200
      or candidate_change_type not in (
        'squad_added', 'transfer', 'loan_in', 'loan_out', 'loan_return',
        'released', 'contract_expired', 'squad_removed', 'unknown'
      )
      or (candidate_from_team_id is null and candidate_to_team_id is null
        and candidate_from_team_name is null and candidate_to_team_name is null)
      or char_length(coalesce(candidate_from_team_id, '')) > 80
      or char_length(coalesce(candidate_to_team_id, '')) > 80
      or char_length(coalesce(candidate_from_team_name, '')) > 200
      or char_length(coalesce(candidate_to_team_name, '')) > 200
      or octet_length(candidate_before_value::text) > 20000
      or octet_length(candidate_after_value::text) > 20000
      or candidate_observed_at is null
      or candidate_observed_at < now() - interval '1 year'
      or candidate_observed_at > now() + interval '1 day' then
      raise exception 'INVALID_CHANGE_CANDIDATE';
    end if;

    if candidate_change_type in ('squad_added', 'loan_in')
      and candidate_to_team_id is null and candidate_to_team_name is null then
      raise exception 'CHANGE_DESTINATION_REQUIRED';
    end if;
    if candidate_change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
      and candidate_from_team_id is null and candidate_from_team_name is null then
      raise exception 'CHANGE_ORIGIN_REQUIRED';
    end if;
    if candidate_from_team_id is not null and not exists (
      select 1 from public.teams team where team.id = candidate_from_team_id
    ) then
      raise exception 'CHANGE_ORIGIN_TEAM_NOT_FOUND';
    end if;
    if candidate_to_team_id is not null and not exists (
      select 1 from public.teams team where team.id = candidate_to_team_id
    ) then
      raise exception 'CHANGE_DESTINATION_TEAM_NOT_FOUND';
    end if;

    reflected_now := false;
    if candidate_change_type in ('squad_added', 'transfer', 'loan_in', 'loan_return')
      and candidate_to_team_id is not null then
      select exists (
        select 1
        from public.team_players player
        where player.player_id = candidate_player_id
          and player.team_id = candidate_to_team_id
          and player.season = 2026
          and player.league_id = 'kleague'
          and player.in_squad
      ) into reflected_now;
    elsif candidate_change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
      and candidate_from_team_id is not null then
      select not exists (
        select 1
        from public.team_players player
        where player.player_id = candidate_player_id
          and player.team_id = candidate_from_team_id
          and player.season = 2026
          and player.league_id = 'kleague'
          and player.in_squad
      ) into reflected_now;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(candidate_dedupe, 0)
    );
    select event.id into existing_event_id
    from public.player_change_events event
    where event.dedupe_key = candidate_dedupe;

    insert into public.player_change_events as existing (
      dedupe_key, player_id, player_name, from_team_id, to_team_id,
      change_type, field_path, before_value, after_value, movement_date,
      detected_at, source, source_reference, db_reflected, review_status,
      reflected_at, sync_run_id
    ) values (
      candidate_dedupe, candidate_player_id, candidate_player_name,
      candidate_from_team_id, candidate_to_team_id, candidate_change_type,
      'team_id', candidate_before_value, candidate_after_value,
      candidate_movement_date, candidate_observed_at, 'SportsMonks candidate',
      nullif(left(trim(coalesce(p_source_reference, '')), 500), ''),
      reflected_now, 'detected', case when reflected_now then now() else null end,
      p_sync_run_id
    )
    on conflict (dedupe_key) do update set
      player_name = excluded.player_name,
      from_team_id = coalesce(excluded.from_team_id, existing.from_team_id),
      to_team_id = coalesce(excluded.to_team_id, existing.to_team_id),
      change_type = case
        when existing.review_status = 'detected'
          and existing.change_type = 'unknown'
        then excluded.change_type
        else existing.change_type
      end,
      before_value = excluded.before_value,
      after_value = excluded.after_value,
      movement_date = coalesce(excluded.movement_date, existing.movement_date),
      detected_at = greatest(existing.detected_at, excluded.detected_at),
      source_reference = coalesce(excluded.source_reference, existing.source_reference),
      db_reflected = existing.db_reflected or excluded.db_reflected,
      reflected_at = case
        when existing.db_reflected or excluded.db_reflected
        then coalesce(existing.reflected_at, excluded.reflected_at, now())
        else null
      end,
      sync_run_id = coalesce(excluded.sync_run_id, existing.sync_run_id);

    if existing_event_id is null then
      created_count := created_count + 1;
    else
      existing_count := existing_count + 1;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function public.reconcile_provider_player_change_candidates(
  p_team_id text,
  p_season integer default 2026,
  p_league_id text default 'kleague',
  p_sync_run_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer := 0;
begin
  if not public.is_admin('operator')
    and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  if p_team_id is null or p_team_id = ''
    or p_season < 2000 or p_season > 2200
    or not exists (select 1 from public.teams team where team.id = p_team_id) then
    raise exception 'INVALID_RECONCILIATION_TARGET';
  end if;

  update public.player_change_events event set
    db_reflected = true,
    reflected_at = coalesce(event.reflected_at, now()),
    sync_run_id = coalesce(p_sync_run_id, event.sync_run_id)
  where not event.db_reflected
    and event.source = 'SportsMonks candidate'
    and (
      (
        event.to_team_id = p_team_id
        and event.change_type in ('squad_added', 'transfer', 'loan_in', 'loan_return')
        and exists (
          select 1 from public.team_players player
          where player.player_id = event.player_id
            and player.team_id = p_team_id
            and player.season = p_season
            and player.league_id = p_league_id
            and player.in_squad
        )
      )
      or (
        event.from_team_id = p_team_id
        and event.change_type in ('squad_removed', 'loan_out', 'released', 'contract_expired')
        and not exists (
          select 1 from public.team_players player
          where player.player_id = event.player_id
            and player.team_id = p_team_id
            and player.season = p_season
            and player.league_id = p_league_id
            and player.in_squad
        )
      )
    );

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.ingest_provider_player_change_candidates(
  text, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.ingest_provider_player_change_candidates(
  text, text, uuid, jsonb
) to service_role;

revoke all on function public.reconcile_provider_player_change_candidates(
  text, integer, text, uuid
) from public, anon;
grant execute on function public.reconcile_provider_player_change_candidates(
  text, integer, text, uuid
) to authenticated, service_role;

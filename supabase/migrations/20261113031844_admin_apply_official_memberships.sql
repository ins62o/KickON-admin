-- Apply reviewed official memberships through the signed administrator's session.
CREATE FUNCTION public.admin_apply_official_memberships(p_batch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET default_transaction_isolation = 'repeatable read'
SET lock_timeout = '4s'
AS $$
DECLARE
  season_year integer;
  review_reason text;
  item jsonb;
  pid text;
  official_id text;
  dob date;
  request_id uuid;
  source_row public.team_players%ROWTYPE;
  destination public.team_players%ROWTYPE;
  old_assertion jsonb;
  official_assertion jsonb;
  source_proof jsonb;
  source_hash text;
  request_hash text;
  new_number integer;
  old_override public.manual_overrides%ROWTYPE;
  prior_operation public.canonical_membership_operations%ROWTYPE;
  active_count integer;
  review jsonb;
  projection jsonb;
  result jsonb := '[]';
  row_status text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'CANONICAL_SUPER_ADMIN_REQUIRED';
  END IF;
  PERFORM public.canonical_membership_actor();

  IF jsonb_typeof(p_batch->'players') IS DISTINCT FROM 'array' OR pg_column_size(p_batch)>180000 THEN
    RAISE EXCEPTION 'INVALID_OFFICIAL_MEMBERSHIP_BATCH';
  END IF;
  season_year := (p_batch->>'season')::integer;
  review_reason := btrim(p_batch->>'reason');
  IF season_year IS NULL OR season_year NOT BETWEEN 2000 AND 2200
     OR review_reason IS NULL OR char_length(review_reason) NOT BETWEEN 3 AND 500
     OR jsonb_array_length(p_batch->'players') NOT BETWEEN 1 AND 29 THEN
    RAISE EXCEPTION 'INVALID_OFFICIAL_MEMBERSHIP_BATCH';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_batch->'players') AS rows(value)
    GROUP BY value->>'player_id' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_batch->'players') AS rows(value)
    GROUP BY value->>'official_player_id' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_batch->'players') AS rows(value)
    GROUP BY value->>'operation_id' HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_OFFICIAL_MEMBERSHIP';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_batch->'players') ORDER BY value->>'player_id'
  LOOP
    pid := item->>'player_id';
    official_id := item->>'official_player_id';
    dob := (item->>'date_of_birth')::date;
    request_id := (item->>'operation_id')::uuid;
    new_number := (item->>'shirt_number')::integer;
    IF coalesce(pid,'') !~ '^[1-9][0-9]{0,15}$' OR coalesce(official_id,'') !~ '^[1-9][0-9]{0,15}$'
       OR request_id IS NULL OR dob IS NULL OR new_number IS NULL OR new_number NOT BETWEEN 0 AND 999
       OR item->>'from_team_id' IS NOT DISTINCT FROM item->>'to_team_id'
       OR jsonb_typeof(item->'sources') IS DISTINCT FROM 'array'
       OR jsonb_typeof(item->'stats') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_OFFICIAL_MEMBERSHIP_PLAYER';
    END IF;
    PERFORM public.admin_assert_football_scope(season_year,item->>'from_league_id',item->>'from_team_id');
    PERFORM public.admin_assert_football_scope(season_year,item->>'to_league_id',item->>'to_team_id');
    PERFORM public.canonical_membership_lock(season_year,pid);

    request_hash := encode(extensions.digest(jsonb_build_array(season_year,review_reason,item)::text,'sha256'),'hex');
    SELECT op.* INTO prior_operation FROM public.canonical_membership_operations op
      WHERE op.operation_id=request_id;
    IF FOUND THEN
      IF prior_operation.status<>'applied' OR prior_operation.transition_evidence->>'request_hash' IS DISTINCT FROM request_hash
         OR NOT public.canonical_membership_matches(season_year,pid,item->>'to_league_id',item->>'to_team_id') THEN
        RAISE EXCEPTION 'STALE_OFFICIAL_MEMBERSHIP_REQUEST: %', pid;
      END IF;
      PERFORM public.canonical_membership_assert_consistent(season_year,pid);
      result := result || jsonb_build_array(jsonb_build_object(
        'player_id',pid,'operation_id',request_id,'status','already_applied'));
      CONTINUE;
    END IF;

    SELECT t.* INTO source_row FROM public.team_players t
      WHERE t.season=season_year AND t.player_id=pid AND t.league_id=item->>'from_league_id'
        AND t.team_id=item->>'from_team_id' AND t.in_squad FOR UPDATE;
    IF NOT FOUND OR source_row.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz
       OR source_row.date_of_birth IS DISTINCT FROM dob OR source_row.manual_lock
       OR btrim(item->>'name') IS DISTINCT FROM btrim(coalesce(source_row.display_name_ko,source_row.display_name,source_row.player_name)) THEN
      RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_SOURCE_CHANGED: %', pid;
    END IF;
    SELECT t.* INTO destination FROM public.team_players t
      WHERE t.season=season_year AND t.player_id=pid AND t.league_id=item->>'to_league_id'
        AND t.team_id=item->>'to_team_id' FOR UPDATE;
    SELECT to_jsonb(a) INTO old_assertion FROM public.canonical_player_membership_assertions a
      WHERE a.season=season_year AND a.player_id=pid AND a.status='active' AND a.released_at IS NULL FOR UPDATE;
    IF old_assertion IS NOT NULL AND (old_assertion->>'league_id',old_assertion->>'team_id')
       IS DISTINCT FROM (source_row.league_id,source_row.team_id) THEN
      RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_ASSERTION_CHANGED: %', pid;
    END IF;

    SELECT jsonb_agg(
      jsonb_build_object('kind',value->>'kind','url',value->>'url','sha256',value->>'sha256',
        'official_player_id',official_id,'date_of_birth',dob,'season',season_year,
        'team_id',item->>'to_team_id','league_id',item->>'to_league_id') ORDER BY ordinality
    ) INTO source_proof FROM jsonb_array_elements(item->'sources') WITH ORDINALITY;
    IF jsonb_array_length(item->'sources') NOT BETWEEN 2 AND 5 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(item->'sources') AS receipts(value)
      WHERE value->>'kind' IS NULL OR value->>'kind' NOT IN ('player_profile','current_squad','season_statistics','match_records')
        OR char_length(value->>'url')>400
    ) OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(item->'sources') AS receipts(value)
      WHERE value->>'kind' IN ('season_statistics','match_records')
    ) THEN
      RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_EVIDENCE_REQUIRED: %', pid;
    END IF;
    source_hash := encode(extensions.digest(source_proof::text,'sha256'),'hex');
    IF EXISTS (
      SELECT 1 FROM unnest(ARRAY['appearances','goals','assists']) AS fields(field)
      WHERE coalesce(item->'stats'->>field,'') !~ '^[0-9]{1,3}$'
        OR jsonb_typeof(item->'stats'->field) IS DISTINCT FROM 'number'
    ) THEN
      RAISE EXCEPTION 'INVALID_OFFICIAL_MEMBERSHIP_STATISTICS: %', pid;
    END IF;
    review := jsonb_build_object('reason',review_reason,'official_source_hash',source_hash,
      'request_hash',request_hash,'source_team_id',source_row.team_id,'source_league_id',source_row.league_id);

    SELECT count(*) INTO active_count FROM public.team_players t
      WHERE t.season=season_year AND t.player_id=pid AND t.in_squad;
    IF active_count>1 THEN
      -- Only retire a stale cross-league duplicate when the destination owns the sole effective period.
      IF active_count<>2 OR destination.in_squad IS DISTINCT FROM true OR destination.date_of_birth IS DISTINCT FROM dob
         OR source_row.league_id=destination.league_id OR old_assertion IS NOT NULL OR (
           SELECT count(*) FROM public.team_player_membership_periods p
           WHERE p.season=season_year AND p.player_id=pid AND p.ended_observed_at IS NULL AND p.superseded_by_assertion_id IS NULL
         )<>1 OR NOT EXISTS (
           SELECT 1 FROM public.team_player_membership_periods p WHERE p.season=season_year AND p.player_id=pid
             AND p.team_id=destination.team_id AND p.league_id=destination.league_id
             AND p.ended_observed_at IS NULL AND p.superseded_by_assertion_id IS NULL
         ) THEN
        RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_MULTIPLE_CURRENT: %', pid;
      END IF;
      review := review || jsonb_build_object('retired_duplicate_before',to_jsonb(source_row));
      UPDATE public.team_players t SET in_squad=false,updated_at=now()
        WHERE t.season=season_year AND t.player_id=pid AND t.league_id=source_row.league_id
          AND t.team_id=source_row.team_id;
    END IF;

    IF destination.player_id IS NOT NULL THEN
      -- An existing destination keeps its complete row, including the stored team totals.
      IF destination.date_of_birth IS DISTINCT FROM dob
         OR jsonb_build_object('appearances',destination.appearances,'goals',destination.goals,'assists',destination.assists)
              IS DISTINCT FROM item->'stats' THEN
        RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_DESTINATION_CONFLICT: %', pid;
      END IF;
      projection := jsonb_build_object('shirt_number',new_number);
    ELSE
      -- Native transition archives the entire old projection when the league key is reused.
      projection := jsonb_build_object('player_name',source_row.player_name,'display_name',source_row.display_name,
        'display_name_ko',source_row.display_name_ko,'image_url',source_row.image_url,'date_of_birth',dob,
        'position',source_row.position,'detailed_position',source_row.detailed_position,
        'height',source_row.height,'weight',source_row.weight,'shirt_number',new_number,
        'appearances',(item->'stats'->>'appearances')::integer,'goals',(item->'stats'->>'goals')::integer,
        'assists',(item->'stats'->>'assists')::integer);
    END IF;

    IF source_row.league_id=item->>'to_league_id' AND new_number IS DISTINCT FROM source_row.shirt_number THEN
      SELECT m.* INTO old_override FROM public.manual_overrides m
        WHERE m.season=season_year AND m.entity_type='player' AND m.entity_id=pid AND m.league_id=source_row.league_id
          AND m.field_path='shirt_number' AND m.team_scope_id IS NULL AND m.blocks_sync
          AND m.released_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>now()) FOR UPDATE;
      IF FOUND THEN
        IF old_override.override_value IS DISTINCT FROM to_jsonb(source_row.shirt_number)
           OR NOT public.release_player_manual_override(old_override.id,'이전 구단 배번 보관 · 공식 소속 변경') THEN
          RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_NUMBER_CONFLICT: %', pid;
        END IF;
        review := review || jsonb_build_object('previous_shirt_number_override',to_jsonb(old_override));
      END IF;
    END IF;

    official_assertion := public.register_canonical_membership_assertion(request_id,jsonb_build_object(
      'season',season_year,'player_id',pid,'official_player_id',official_id,'date_of_birth',dob,
      'team_id',item->>'to_team_id','league_id',item->>'to_league_id','official_sources',source_proof,
      'official_source_hash',source_hash,'verified_at',item->>'verified_at','effective_date_status','UNKNOWN',
      'revision_reason',review_reason,'official_projection',projection,
      'identity_proof',jsonb_build_object('confidence','HIGH','date_of_birth',dob,'official_to_provider',jsonb_build_array(pid),
        'provider_to_official',jsonb_build_array(official_id),'artifact_sha256',request_hash)
    ),old_assertion);
    row_status := public.apply_canonical_membership_transition(request_id,(official_assertion->>'id')::uuid,
      public.canonical_membership_state(season_year,pid),projection,review)->>'status';
    IF row_status IS DISTINCT FROM 'APPLIED' THEN
      RAISE EXCEPTION 'OFFICIAL_MEMBERSHIP_TRANSITION_FAILED: %', pid;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object('player_id',pid,'operation_id',request_id,'status','applied'));
  END LOOP;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_official_memberships(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_official_memberships(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

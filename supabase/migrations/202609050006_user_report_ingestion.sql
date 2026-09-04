-- KICKON Data Center: authenticated mobile data-report ingestion.
-- Apply after 202609050005. Clients submit through POST /api/data-reports.

alter table public.user_data_reports
  add column if not exists client_request_id text;

alter table public.user_data_reports
  drop constraint if exists user_data_reports_client_request_id_check;
alter table public.user_data_reports
  add constraint user_data_reports_client_request_id_check
  check (
    client_request_id is null
    or client_request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$'
  );

create unique index if not exists user_data_reports_request_id_idx
  on public.user_data_reports (reporter_id, client_request_id)
  where client_request_id is not null;

create or replace function public.submit_user_data_report(
  p_reporter_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_field_path text,
  p_current_value jsonb,
  p_proposed_value jsonb,
  p_description text,
  p_evidence_urls text[],
  p_client_request_id text
)
returns table (
  report_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_entity_id text := nullif(trim(coalesce(p_entity_id, '')), '');
  normalized_field_path text := nullif(trim(coalesce(p_field_path, '')), '');
  normalized_description text := trim(coalesce(p_description, ''));
  normalized_request_id text := nullif(trim(coalesce(p_client_request_id, '')), '');
  normalized_evidence_urls text[] := coalesce(p_evidence_urls, '{}'::text[]);
  existing_report_id uuid;
  inserted_report_id uuid;
  recent_report_count integer;
  entity_exists boolean := false;
begin
  if p_reporter_id is null or not exists (
    select 1 from auth.users account where account.id = p_reporter_id
  ) then
    raise exception 'INVALID_REPORTER';
  end if;

  if p_entity_type not in ('team', 'player', 'fixture', 'standing', 'ranking', 'other') then
    raise exception 'INVALID_REPORT_ENTITY_TYPE';
  end if;
  if p_entity_type <> 'other' and normalized_entity_id is null then
    raise exception 'REPORT_ENTITY_REQUIRED';
  end if;
  if normalized_entity_id is not null and char_length(normalized_entity_id) > 200 then
    raise exception 'INVALID_REPORT_ENTITY_ID';
  end if;
  if normalized_field_path is not null and char_length(normalized_field_path) > 200 then
    raise exception 'INVALID_REPORT_FIELD_PATH';
  end if;
  if char_length(normalized_description) < 3 or char_length(normalized_description) > 4000 then
    raise exception 'INVALID_REPORT_DESCRIPTION';
  end if;
  if octet_length(coalesce(p_current_value::text, '')) > 20000
    or octet_length(coalesce(p_proposed_value::text, '')) > 20000 then
    raise exception 'REPORT_VALUE_TOO_LARGE';
  end if;
  if cardinality(normalized_evidence_urls) > 5 or exists (
    select 1
    from unnest(normalized_evidence_urls) evidence_url
    where char_length(evidence_url) > 2048
      or evidence_url !~* '^https://[^[:space:]]+$'
  ) then
    raise exception 'INVALID_REPORT_EVIDENCE_URL';
  end if;
  if normalized_request_id is not null
    and normalized_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' then
    raise exception 'INVALID_REPORT_REQUEST_ID';
  end if;

  -- Serialize submissions per reporter so retries and the hourly limit remain stable.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_reporter_id::text, 0)
  );

  if normalized_request_id is not null then
    select report.id into existing_report_id
    from public.user_data_reports report
    where report.reporter_id = p_reporter_id
      and report.client_request_id = normalized_request_id;

    if existing_report_id is not null then
      return query select existing_report_id, false;
      return;
    end if;
  end if;

  select count(*)::integer into recent_report_count
  from public.user_data_reports report
  where report.reporter_id = p_reporter_id
    and report.created_at >= now() - interval '1 hour';

  if recent_report_count >= 10 then
    raise exception 'REPORT_RATE_LIMIT';
  end if;

  case p_entity_type
    when 'team' then
      select exists (
        select 1 from public.teams team where team.id::text = normalized_entity_id
      ) into entity_exists;
    when 'player' then
      select exists (
        select 1 from public.team_players player where player.player_id::text = normalized_entity_id
      ) into entity_exists;
    when 'fixture' then
      select exists (
        select 1 from public.fixtures fixture where fixture.id::text = normalized_entity_id
      ) into entity_exists;
    when 'standing' then
      select exists (
        select 1 from public.league_standings standing where standing.team_id::text = normalized_entity_id
      ) into entity_exists;
    when 'ranking' then
      select exists (
        select 1 from public.player_scoring_stats ranking where ranking.player_id::text = normalized_entity_id
      ) into entity_exists;
    when 'other' then
      entity_exists := true;
  end case;

  if not entity_exists then
    raise exception 'REPORT_ENTITY_NOT_FOUND';
  end if;

  insert into public.user_data_reports (
    reporter_id,
    entity_type,
    entity_id,
    field_path,
    current_value,
    proposed_value,
    description,
    evidence_urls,
    status,
    priority,
    client_request_id
  ) values (
    p_reporter_id,
    p_entity_type,
    normalized_entity_id,
    normalized_field_path,
    p_current_value,
    p_proposed_value,
    normalized_description,
    normalized_evidence_urls,
    'open',
    'normal',
    normalized_request_id
  )
  returning id into inserted_report_id;

  return query select inserted_report_id, true;
end;
$$;

-- Mobile clients cannot choose operator-owned fields with a direct table insert.
drop policy if exists "users create own data reports" on public.user_data_reports;
revoke insert on table public.user_data_reports from authenticated;

revoke all on function public.submit_user_data_report(
  uuid, text, text, text, jsonb, jsonb, text, text[], text
) from public, anon, authenticated;
grant execute on function public.submit_user_data_report(
  uuid, text, text, text, jsonb, jsonb, text, text[], text
) to service_role;

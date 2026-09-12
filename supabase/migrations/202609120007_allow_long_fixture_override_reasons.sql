begin;

alter table public.manual_overrides
  drop constraint if exists manual_overrides_reason_check;
alter table public.manual_overrides
  add constraint manual_overrides_reason_check
  check (char_length(reason) >= 3);

create or replace function public.apply_fixture_manual_override(
  p_fixture_id text,
  p_field_path text,
  p_override_value jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  current_row jsonb;
  current_league text;
  target_override uuid;
begin
  if not public.is_admin('admin') or current_actor is null then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_field_path not in ('kickoff_at', 'status', 'home_score', 'away_score', 'round')
    or p_override_value is null
    or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'INVALID_FIXTURE_OVERRIDE';
  end if;
  if p_field_path = 'status' and (p_override_value #>> '{}') not in ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED') then
    raise exception 'INVALID_FIXTURE_STATUS';
  end if;

  select to_jsonb(fixture), fixture.league_id into current_row, current_league
  from public.fixtures fixture
  where fixture.id = p_fixture_id
  for update;
  if current_row is null then raise exception 'FIXTURE_NOT_FOUND'; end if;

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  ) values (
    'fixture', p_fixture_id, 2026, current_league, p_field_path,
    current_row -> p_field_path, p_override_value, trim(p_reason), true, current_actor
  )
  on conflict (entity_type, entity_id, season, league_id, field_path) where released_at is null
  do update set override_value = excluded.override_value, reason = excluded.reason,
    blocks_sync = true, updated_at = now()
  returning id into target_override;

  update public.fixtures fixture set
    kickoff_at = case when p_field_path = 'kickoff_at' then (p_override_value #>> '{}')::timestamptz else fixture.kickoff_at end,
    status = case when p_field_path = 'status' then p_override_value #>> '{}' else fixture.status end,
    home_score = case when p_field_path = 'home_score' then (p_override_value #>> '{}')::integer else fixture.home_score end,
    away_score = case when p_field_path = 'away_score' then (p_override_value #>> '{}')::integer else fixture.away_score end,
    round = case when p_field_path = 'round' then (p_override_value #>> '{}')::integer else fixture.round end,
    updated_at = now()
  where fixture.id = p_fixture_id;

  return target_override;
end;
$$;

revoke all on function public.apply_fixture_manual_override(text, text, jsonb, text)
  from public, anon;
grant execute on function public.apply_fixture_manual_override(text, text, jsonb, text)
  to authenticated;

commit;

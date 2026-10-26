create or replace function public.claim_fixture_lineup_sync(
  target_fixture_id text,
  target_cooldown_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.fixture_lineup_sync_state (
    fixture_id,
    last_attempted_at,
    provider_has_lineup,
    last_error
  )
  values (
    target_fixture_id,
    now(),
    false,
    null
  )
  on conflict (fixture_id) do update
  set last_attempted_at = excluded.last_attempted_at,
      last_error = null
  where public.fixture_lineup_sync_state.last_attempted_at
    <= now() - make_interval(
      secs => greatest(target_cooldown_seconds, 0)
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_fixture_lineup_sync(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_fixture_lineup_sync(text, integer)
  to service_role;

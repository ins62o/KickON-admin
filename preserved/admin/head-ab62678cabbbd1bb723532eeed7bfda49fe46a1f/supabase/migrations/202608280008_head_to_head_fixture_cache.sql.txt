create table if not exists public.head_to_head_fixtures (
  provider text not null default 'sportmonks',
  provider_fixture_id bigint primary key,
  provider_league_id bigint,
  provider_season_id bigint,
  season integer not null,
  home_team_id text not null references public.teams(id) on delete cascade,
  away_team_id text not null references public.teams(id) on delete cascade,
  kickoff_at timestamptz not null,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);

create index if not exists head_to_head_fixtures_pair_kickoff_idx
  on public.head_to_head_fixtures (
    least(home_team_id, away_team_id),
    greatest(home_team_id, away_team_id),
    kickoff_at desc
  );

alter table public.head_to_head_fixtures enable row level security;

drop policy if exists "authenticated users read head to head fixtures"
  on public.head_to_head_fixtures;
create policy "authenticated users read head to head fixtures"
  on public.head_to_head_fixtures
  for select
  to authenticated
  using (true);

grant select on public.head_to_head_fixtures to authenticated;

create table if not exists public.head_to_head_sync_state (
  pair_key text primary key,
  first_team_id text not null references public.teams(id) on delete cascade,
  second_team_id text not null references public.teams(id) on delete cascade,
  last_attempted_at timestamptz not null default now(),
  last_succeeded_at timestamptz,
  provider_has_data boolean not null default false,
  last_error text,
  check (first_team_id < second_team_id),
  check (pair_key = first_team_id || ':' || second_team_id)
);

alter table public.head_to_head_sync_state enable row level security;

drop policy if exists "authenticated users read head to head sync state"
  on public.head_to_head_sync_state;
create policy "authenticated users read head to head sync state"
  on public.head_to_head_sync_state
  for select
  to authenticated
  using (true);

grant select on public.head_to_head_sync_state to authenticated;

create or replace function public.claim_head_to_head_sync(
  target_pair_key text,
  target_first_team_id text,
  target_second_team_id text,
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
  insert into public.head_to_head_sync_state (
    pair_key,
    first_team_id,
    second_team_id,
    last_attempted_at,
    provider_has_data,
    last_error
  )
  values (
    target_pair_key,
    target_first_team_id,
    target_second_team_id,
    now(),
    false,
    null
  )
  on conflict (pair_key) do update
  set last_attempted_at = excluded.last_attempted_at,
      last_error = null
  where public.head_to_head_sync_state.last_succeeded_at is null
    and public.head_to_head_sync_state.last_attempted_at
      <= now() - make_interval(
        secs => greatest(target_cooldown_seconds, 0)
      )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_head_to_head_sync(
  text,
  text,
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.claim_head_to_head_sync(
  text,
  text,
  text,
  integer
) to service_role;

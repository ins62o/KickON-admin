create table if not exists public.football_provider_teams (
  provider text not null,
  provider_season_id bigint not null,
  provider_team_id bigint not null,
  provider_team_name text not null,
  internal_team_id text references public.teams(id),
  mapping_status text not null
    check (mapping_status in ('MAPPED', 'UNMAPPED')),
  discovered_at timestamptz not null default now(),
  primary key (provider, provider_season_id, provider_team_id)
);

create index if not exists football_provider_teams_internal_idx
  on public.football_provider_teams (internal_team_id, provider_season_id);

alter table public.football_provider_teams enable row level security;
grant select on public.football_provider_teams to anon, authenticated;

drop policy if exists "public reads football provider teams"
  on public.football_provider_teams;
create policy "public reads football provider teams"
  on public.football_provider_teams
  for select
  to anon, authenticated
  using (true);

grant all on public.football_provider_teams to service_role;

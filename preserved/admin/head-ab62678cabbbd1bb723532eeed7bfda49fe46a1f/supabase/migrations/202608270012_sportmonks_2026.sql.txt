alter table public.teams
add column if not exists sportmonks_id bigint;

create unique index if not exists teams_sportmonks_id_unique_idx
on public.teams (sportmonks_id)
where sportmonks_id is not null;

alter table public.stadiums
add column if not exists sportmonks_id bigint;

create unique index if not exists stadiums_sportmonks_id_unique_idx
on public.stadiums (sportmonks_id)
where sportmonks_id is not null;

alter table public.fixtures
add column if not exists sportmonks_id bigint;

create unique index if not exists fixtures_sportmonks_id_unique_idx
on public.fixtures (sportmonks_id)
where sportmonks_id is not null;

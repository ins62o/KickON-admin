alter table public.teams
add column if not exists api_football_id bigint;

create unique index if not exists teams_api_football_id_unique_idx
on public.teams (api_football_id)
where api_football_id is not null;

alter table public.stadiums
add column if not exists api_football_id bigint;

create unique index if not exists stadiums_api_football_id_unique_idx
on public.stadiums (api_football_id)
where api_football_id is not null;

alter table public.fixtures
add column if not exists api_football_id bigint;

create unique index if not exists fixtures_api_football_id_unique_idx
on public.fixtures (api_football_id)
where api_football_id is not null;

insert into public.teams (id, name, short_name, code, api_football_id) values
  ('daegu', '대구 FC', '대구', 'DGU', 2747),
  ('suwon-fc', '수원 FC', '수원FC', 'SFC', 2756),
  ('seoul-eland', '서울 이랜드 FC', '서울E', 'SEL', 2749),
  ('chungnam-asan', '충남 아산 FC', '충남아산', 'ASA', 2753)
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  code = excluded.code,
  api_football_id = excluded.api_football_id;

update public.teams
set api_football_id = mapping.api_id
from (values
  ('seoul', 2766::bigint),
  ('jeonbuk', 2762::bigint),
  ('ulsan', 2767::bigint),
  ('incheon', 2763::bigint),
  ('daejeon', 2750::bigint),
  ('pohang', 2764::bigint),
  ('gangwon', 2746::bigint),
  ('jeju', 2761::bigint),
  ('gwangju', 2759::bigint),
  ('gimcheon', 2768::bigint)
) as mapping(team_id, api_id)
where public.teams.id = mapping.team_id;

update public.stadiums
set api_football_id = mapping.api_id
from (values
  ('incheon-football-stadium', 1013::bigint),
  ('seoul-world-cup-stadium', 1002::bigint),
  ('jeonju-world-cup-stadium', 1015::bigint)
) as mapping(stadium_id, api_id)
where public.stadiums.id = mapping.stadium_id;

create table if not exists public.fixture_lineups (
  fixture_id text not null references public.fixtures(id) on delete cascade,
  team_id text not null references public.teams(id),
  formation text,
  coach_id text,
  coach_name text,
  fetched_at timestamptz not null default now(),
  primary key (fixture_id, team_id)
);

create table if not exists public.fixture_lineup_players (
  fixture_id text not null,
  team_id text not null,
  player_id text not null,
  player_name text not null,
  shirt_number integer,
  position text,
  grid text,
  role text not null check (role in ('STARTER', 'SUBSTITUTE')),
  sort_order integer not null default 0,
  primary key (fixture_id, team_id, player_id, role),
  foreign key (fixture_id, team_id)
    references public.fixture_lineups(fixture_id, team_id)
    on delete cascade
);

create index if not exists fixture_lineup_players_fixture_idx
on public.fixture_lineup_players (fixture_id, team_id, role, sort_order);

alter table public.fixture_lineups enable row level security;
alter table public.fixture_lineup_players enable row level security;

drop policy if exists "authenticated users read fixture lineups"
on public.fixture_lineups;
create policy "authenticated users read fixture lineups"
on public.fixture_lineups
for select to authenticated
using (true);

drop policy if exists "authenticated users read fixture lineup players"
on public.fixture_lineup_players;
create policy "authenticated users read fixture lineup players"
on public.fixture_lineup_players
for select to authenticated
using (true);

grant select on public.fixture_lineups to authenticated;
grant select on public.fixture_lineup_players to authenticated;

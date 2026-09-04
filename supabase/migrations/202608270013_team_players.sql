create table if not exists public.team_players (
  season integer not null,
  league_id text not null,
  team_id text not null references public.teams(id) on delete cascade,
  player_id text not null,
  player_name text not null,
  display_name text,
  image_url text,
  shirt_number integer,
  position text,
  detailed_position text,
  appearances integer not null default 0 check (appearances >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  height integer,
  weight integer,
  date_of_birth date,
  in_squad boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (season, league_id, player_id)
);

create index if not exists team_players_team_season_idx
  on public.team_players (team_id, season, league_id);

alter table public.team_players enable row level security;

drop policy if exists "Authenticated users can read team players"
  on public.team_players;
create policy "Authenticated users can read team players"
  on public.team_players
  for select
  to authenticated
  using (true);

grant select on public.team_players to authenticated;

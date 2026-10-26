alter table public.fixture_lineup_players
  add column if not exists display_name_ko text;

update public.fixture_lineup_players as lineup_player
set display_name_ko = team_player.display_name_ko
from public.team_players as team_player
where lineup_player.player_id = team_player.player_id
  and lineup_player.team_id = team_player.team_id
  and team_player.season = 2026
  and team_player.league_id = 'kleague'
  and team_player.display_name_ko is not null;

update public.team_players
set display_name_ko = '이민혁',
    updated_at = now()
where season = 2026
  and league_id = 'kleague'
  and team_id = 'incheon'
  and lower(
    regexp_replace(coalesce(display_name, player_name), '[^a-z]', '', 'g')
  ) in ('minhyuklee', 'leeminhyuk');

update public.fixture_lineup_players
set display_name_ko = '이민혁'
where team_id = 'incheon'
  and lower(regexp_replace(player_name, '[^a-z]', '', 'g'))
    in ('minhyuklee', 'leeminhyuk');

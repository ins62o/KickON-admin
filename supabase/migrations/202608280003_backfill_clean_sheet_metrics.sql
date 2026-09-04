update public.league_standings
set clean_sheets = 0
where season = 2026
  and league_id = 'kleague';

with clean_sheet_matches as (
  select home_team_id as team_id
  from public.fixtures
  where league_id = 'kleague'
    and status = 'FINISHED'
    and away_score = 0

  union all

  select away_team_id as team_id
  from public.fixtures
  where league_id = 'kleague'
    and status = 'FINISHED'
    and home_score = 0
),
clean_sheet_totals as (
  select team_id, count(*)::integer as clean_sheets
  from clean_sheet_matches
  group by team_id
)
update public.league_standings as standing
set clean_sheets = total.clean_sheets,
    updated_at = now()
from clean_sheet_totals as total
where standing.season = 2026
  and standing.league_id = 'kleague'
  and standing.team_id = total.team_id;

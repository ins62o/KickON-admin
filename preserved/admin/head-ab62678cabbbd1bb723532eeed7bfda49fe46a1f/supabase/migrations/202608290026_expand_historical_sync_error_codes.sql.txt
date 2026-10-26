alter table public.football_provider_seasons
  drop constraint if exists football_provider_seasons_sync_error_code_check;

alter table public.football_provider_seasons
  add constraint football_provider_seasons_sync_error_code_check
  check (
    sync_error_code is null
    or sync_error_code in (
      'TEAM_MAPPING',
      'FIXTURE_MAPPING',
      'PROVIDER_READ',
      'DATABASE_WRITE',
      'TEAM_READ',
      'TEAM_WRITE',
      'STADIUM_READ',
      'STADIUM_WRITE',
      'FIXTURE_READ',
      'FIXTURE_WRITE',
      'UNKNOWN'
    )
  );

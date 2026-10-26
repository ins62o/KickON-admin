alter table public.football_provider_seasons
  add column if not exists sync_error_code text
  check (
    sync_error_code is null
    or sync_error_code in (
      'TEAM_MAPPING',
      'FIXTURE_MAPPING',
      'PROVIDER_READ',
      'DATABASE_WRITE',
      'UNKNOWN'
    )
  );

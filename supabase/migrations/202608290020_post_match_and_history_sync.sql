alter table public.fixtures
  add column if not exists post_match_sync_due_at timestamptz,
  add column if not exists post_match_synced_at timestamptz;

create index if not exists fixtures_post_match_sync_due_idx
  on public.fixtures (post_match_sync_due_at)
  where post_match_synced_at is null;

comment on column public.fixtures.post_match_sync_due_at is
  'Schedules one consolidated standings, team and player refresh shortly after a live fixture finishes.';
comment on column public.fixtures.post_match_synced_at is
  'When the consolidated post-match football data refresh completed.';

create or replace function public.schedule_post_match_football_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  transitioned_to_finished boolean := false;
begin
  if tg_op = 'INSERT' then
    transitioned_to_finished := new.status = 'FINISHED';
  elsif tg_op = 'UPDATE' then
    transitioned_to_finished := new.status = 'FINISHED'
      and old.status is distinct from new.status;
  end if;

  if transitioned_to_finished
    and new.kickoff_at >= now() - interval '12 hours'
  then
    new.post_match_sync_due_at := now() + interval '10 minutes';
    new.post_match_synced_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists fixtures_schedule_post_match_football_sync
  on public.fixtures;
create trigger fixtures_schedule_post_match_football_sync
before insert or update of status on public.fixtures
for each row execute function public.schedule_post_match_football_sync();

revoke all on function public.schedule_post_match_football_sync()
  from public, anon, authenticated;

create or replace function public.invoke_due_post_match_football_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_season integer;
begin
  select extract(year from fixture.kickoff_at)::integer
  into target_season
  from public.fixtures fixture
  where fixture.status = 'FINISHED'
    and fixture.post_match_sync_due_at <= now()
    and fixture.post_match_synced_at is null
  order by fixture.post_match_sync_due_at
  limit 1;

  if target_season is null then
    return null;
  end if;

  return public.invoke_football_data_sync(
    jsonb_build_object(
      'leagueId', 1034,
      'season', target_season,
      'seasonId', case target_season
        when 2024 then 23091
        when 2025 then 25044
        when 2026 then 26894
        else null
      end,
      'postMatch', true,
      'syncLineups', false
    )
  );
end;
$$;

revoke all on function public.invoke_due_post_match_football_sync()
  from public, anon, authenticated;

create or replace function public.invoke_initial_football_history_backfill()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.football_sync_state state
    where state.sync_key = 'sportmonks-history-2024-2026'
      and state.last_succeeded_at is not null
  ) then
    return null;
  end if;

  return public.invoke_football_data_sync(
    jsonb_build_object('mode', 'backfill-history')
  );
end;
$$;

revoke all on function public.invoke_initial_football_history_backfill()
  from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'kickon-post-match-football-sync',
      'kickon-initial-football-history-backfill'
    )
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

select cron.schedule(
  'kickon-post-match-football-sync',
  '*/5 * * * *',
  $cron$select public.invoke_due_post_match_football_sync();$cron$
);

-- Retry hourly until the Edge Function records a successful 2024-2026 import.
select cron.schedule(
  'kickon-initial-football-history-backfill',
  '23 * * * *',
  $cron$select public.invoke_initial_football_history_backfill();$cron$
);

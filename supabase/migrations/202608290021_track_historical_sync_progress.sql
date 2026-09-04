alter table public.football_provider_seasons
  add column if not exists sync_status text not null default 'PENDING'
    check (sync_status in ('PENDING', 'RUNNING', 'READY', 'ERROR')),
  add column if not exists last_synced_at timestamptz;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'kickon-initial-football-history-backfill'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

-- The SQL guard stops requests after success. The Edge Function claim prevents
-- concurrent imports while a previous request is still running.
select cron.schedule(
  'kickon-initial-football-history-backfill',
  '*/5 * * * *',
  $cron$select public.invoke_initial_football_history_backfill();$cron$
);

-- Keep the app DB-first and refresh provider squad data once per day.
-- sync-team-squad performs additive upserts; provider omissions are reviewed
-- separately and never remove a player from the user-visible squad.

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'kickon-team-squad-refresh'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

-- pg_cron is UTC: 19:10 UTC is 04:10 KST on the following calendar day.
select cron.schedule(
  'kickon-team-squad-refresh',
  '10 19 * * *',
  $cron$select public.invoke_scheduled_team_squad_sync();$cron$
);

comment on function public.invoke_scheduled_team_squad_sync() is
  'Refreshes all mapped 2026 K League squads once daily. Provider omissions do not deactivate stored players.';

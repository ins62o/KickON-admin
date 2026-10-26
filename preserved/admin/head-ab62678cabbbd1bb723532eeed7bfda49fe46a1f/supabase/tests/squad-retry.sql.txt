-- Run after a successful cycle in development. pg_net requests are delivered
-- only after commit; ROLLBACK prevents all test requests and state edits.
begin;
do $$
declare target public.football_sync_state%rowtype; request_count integer;
begin
  select * into strict target from public.football_sync_state
  where sync_key = 'team-squad-2026-suwon-bluewings:2026:kleague2';
  select public.invoke_scheduled_team_squad_sync() into request_count;
  if request_count <> 0 then raise exception 'Healthy cycle enqueued % teams', request_count; end if;

  update public.football_sync_state set last_error = 'test provider failure'
  where sync_key = target.sync_key;
  select public.invoke_scheduled_team_squad_sync() into request_count;
  if request_count <> 1 then raise exception 'Failure retry enqueued % teams', request_count; end if;

  delete from public.football_sync_state where sync_key = target.sync_key;
  select public.invoke_scheduled_team_squad_sync() into request_count;
  if request_count <> 1 then raise exception 'Missing startup retry enqueued % teams', request_count; end if;

  insert into public.football_sync_state select (target).*;
  update public.football_sync_state set last_succeeded_at = now() - interval '2 days'
  where sync_key = target.sync_key;
  select public.invoke_scheduled_team_squad_sync() into request_count;
  if request_count <> 1 then raise exception 'Stale success retry enqueued % teams', request_count; end if;

  if not exists (select 1 from cron.job where jobname = 'kickon-team-squad-retry'
    and schedule = '15-40/5 19 * * *' and active) then
    raise exception 'Bounded retry schedule is missing';
  end if;
end;
$$;
rollback;

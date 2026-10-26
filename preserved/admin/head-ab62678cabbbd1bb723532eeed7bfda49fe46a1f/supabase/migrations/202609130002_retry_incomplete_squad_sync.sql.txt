begin;

create or replace function public.invoke_scheduled_team_squad_sync()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_function_url text;
  function_url text;
  sync_secret text;
  target_team record;
  request_count integer := 0;
  -- Most recent daily 19:10 UTC (04:10 KST) cycle. Retries only revisit
  -- missing/failed teams; yesterday's successful squads are due again today.
  cycle_start timestamptz := (
    date_trunc('day', timezone('UTC', now()) - interval '19 hours 10 minutes')
      + interval '19 hours 10 minutes'
  ) at time zone 'UTC';
begin
  select decrypted_secret into live_function_url
  from vault.decrypted_secrets
  where name = 'kickon_live_football_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'kickon_football_sync_secret'
  limit 1;

  if live_function_url is null or sync_secret is null then
    raise warning 'KickON squad sync Vault secrets are missing';
    return 0;
  end if;

  function_url := regexp_replace(
    live_function_url,
    '/sync-live-football$',
    '/sync-team-squad'
  );

  for target_team in
    select distinct team.id, standing.season, standing.league_id
    from public.teams team
    join public.league_standings standing
      on standing.team_id = team.id
      and standing.season = extract(year from timezone('Asia/Seoul', now()))::integer
      and standing.league_id in (select league_id from public.admin_football_leagues())
    where team.sportmonks_id is not null
      and not exists (
        select 1 from public.football_sync_state state
        where state.sync_key = 'team-squad-' || standing.season || '-' || team.id
          || ':' || standing.season || ':' || standing.league_id
          and state.season = standing.season
          and state.league_id = standing.league_id
          and state.last_succeeded_at >= cycle_start
          and state.last_succeeded_at >= state.last_attempted_at
          and nullif(trim(state.last_error), '') is null
      )
    order by team.id
  loop
    perform net.http_post(
      url := function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-sync-secret', sync_secret
      ),
      body := jsonb_build_object(
        'teamId', target_team.id,
        'season', target_team.season,
        'leagueId', target_team.league_id,
        'force', true
      ),
      timeout_milliseconds := 120000
    );
    request_count := request_count + 1;
  end loop;

  return request_count;
exception
  when others then
    raise warning 'KickON scheduled squad sync enqueue failed: %', sqlerrm;
    return 0;
end;
$$;

revoke all on function public.invoke_scheduled_team_squad_sync() from public, anon, authenticated;

-- Six bounded retries after the daily run, with no provider work for teams
-- that already succeeded. This also recovers failures before handler startup.
do $$
declare existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname = 'kickon-team-squad-retry'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;
select cron.schedule(
  'kickon-team-squad-retry', '15-40/5 19 * * *',
  $cron$select public.invoke_scheduled_team_squad_sync();$cron$
);
comment on function public.invoke_scheduled_team_squad_sync() is
  'Refreshes mapped squads once per daily 04:10 KST cycle; bounded retries enqueue only missing or failed league-scoped teams.';

commit;

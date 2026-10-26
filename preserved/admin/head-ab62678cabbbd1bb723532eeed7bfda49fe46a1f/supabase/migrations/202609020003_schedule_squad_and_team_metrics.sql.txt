-- Schedule focused, low-cost football refreshes without running a full-season import.
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
  local_now timestamp;
  local_date date;
  local_hour integer;
  is_registration_window boolean;
  target_team record;
  request_count integer := 0;
begin
  local_now := timezone('Asia/Seoul', now());
  local_date := local_now::date;
  local_hour := extract(hour from local_now)::integer;
  is_registration_window :=
    local_date between date '2026-01-16' and date '2026-03-26'
    or local_date between date '2026-07-09' and date '2026-08-19';

  -- 04:10 KST runs every day. The other 6-hour slots only run while
  -- 2026 K League player registration is open.
  if local_hour <> 4 and not is_registration_window then
    return 0;
  end if;

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
    select distinct team.id
    from public.teams team
    join public.league_standings standing
      on standing.team_id = team.id
      and standing.season = 2026
      and standing.league_id = 'kleague'
    where team.sportmonks_id is not null
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

revoke all on function public.invoke_scheduled_team_squad_sync()
  from public, anon, authenticated;

comment on function public.invoke_scheduled_team_squad_sync() is
  'Refreshes all mapped 2026 K League squads daily, and every six hours during the official 2026 registration windows.';

create or replace function public.invoke_daily_team_metrics_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  live_function_url text;
  function_url text;
  sync_secret text;
  request_id bigint;
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
    raise warning 'KickON team metrics sync Vault secrets are missing';
    return null;
  end if;

  function_url := regexp_replace(
    live_function_url,
    '/sync-live-football$',
    '/sync-team-metrics'
  );

  select net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', sync_secret
    ),
    body := jsonb_build_object('force', true),
    timeout_milliseconds := 120000
  ) into request_id;

  return request_id;
exception
  when others then
    raise warning 'KickON daily team metrics sync enqueue failed: %', sqlerrm;
    return null;
end;
$$;

revoke all on function public.invoke_daily_team_metrics_sync()
  from public, anon, authenticated;

comment on function public.invoke_daily_team_metrics_sync() is
  'Runs a daily safety reconciliation of 2026 clean sheets and average possession after the event-driven post-match refreshes.';

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'kickon-team-squad-refresh',
      'kickon-team-metrics-reconciliation'
    )
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

-- pg_cron is UTC: 19:10 UTC is 04:10 KST, with additional 6-hour slots
-- that are ignored outside the official player registration windows.
select cron.schedule(
  'kickon-team-squad-refresh',
  '10 1,7,13,19 * * *',
  $cron$select public.invoke_scheduled_team_squad_sync();$cron$
);

-- pg_cron is UTC: 19:40 UTC is 04:40 KST on the following calendar day.
select cron.schedule(
  'kickon-team-metrics-reconciliation',
  '40 19 * * *',
  $cron$select public.invoke_daily_team_metrics_sync();$cron$
);

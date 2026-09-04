alter table public.fixtures
  add column if not exists live_minute smallint,
  add column if not exists live_period text,
  add column if not exists live_updated_at timestamptz;

alter table public.fixtures
  drop constraint if exists fixtures_live_minute_check;
alter table public.fixtures
  add constraint fixtures_live_minute_check
  check (live_minute is null or live_minute between 0 and 150);

create table if not exists public.football_provider_usage (
  id bigint generated always as identity primary key,
  observed_at timestamptz not null default now(),
  source text not null,
  endpoint text not null,
  requested_entity text,
  remaining integer,
  resets_in_seconds integer,
  status_code integer not null
);

create index if not exists football_provider_usage_observed_idx
  on public.football_provider_usage (observed_at desc);
create index if not exists football_provider_usage_entity_observed_idx
  on public.football_provider_usage (requested_entity, observed_at desc);

alter table public.football_provider_usage enable row level security;
revoke all on public.football_provider_usage from public, anon, authenticated;
grant all on public.football_provider_usage to service_role;

create or replace function public.claim_football_sync(
  target_sync_key text,
  target_cooldown_seconds integer default 50
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.football_sync_state (
    sync_key,
    last_attempted_at,
    last_error
  )
  values (
    target_sync_key,
    now(),
    null
  )
  on conflict (sync_key) do update
  set last_attempted_at = excluded.last_attempted_at,
      last_error = null
  where public.football_sync_state.last_attempted_at
    <= now() - make_interval(
      secs => greatest(target_cooldown_seconds, 0)
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_football_sync(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_football_sync(text, integer)
  to service_role;

comment on table public.football_provider_usage is
  'Server-only Sportmonks rate-limit observations. Keep approximately 60 days.';
comment on column public.fixtures.live_minute is
  'Last provider-confirmed cumulative match minute. Clients may render this while status is LIVE.';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'kickon_football_sync_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'kickon_football_sync_secret',
      'Generated scheduler secret for KickON live football sync'
    );
  end if;
end;
$$;

create or replace function public.verify_live_football_sync_secret(
  candidate text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'kickon_football_sync_secret'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.verify_live_football_sync_secret(text)
  from public, anon, authenticated;
grant execute on function public.verify_live_football_sync_secret(text)
  to service_role;

create or replace function public.invoke_live_football_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  sync_secret text;
begin
  select decrypted_secret into function_url
  from vault.decrypted_secrets
  where name = 'kickon_live_football_sync_url'
  limit 1;

  select decrypted_secret into sync_secret
  from vault.decrypted_secrets
  where name = 'kickon_football_sync_secret'
  limit 1;

  if function_url is null or sync_secret is null then
    raise warning 'KickON live football sync Vault secrets are missing';
    return;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', sync_secret
    ),
    body := jsonb_build_object('pollCount', 5),
    timeout_milliseconds := 65000
  );
exception
  when others then
    raise warning 'KickON live football sync enqueue failed: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_live_football_sync()
  from public, anon, authenticated;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'kickon-live-football-sync'
  loop
    perform cron.unschedule(existing_job);
  end loop;
end;
$$;

select cron.schedule(
  'kickon-live-football-sync',
  '* * * * *',
  $cron$select public.invoke_live_football_sync();$cron$
);

select cron.schedule(
  'kickon-football-provider-usage-retention',
  '17 3 * * *',
  $cron$delete from public.football_provider_usage where observed_at < now() - interval '60 days';$cron$
);

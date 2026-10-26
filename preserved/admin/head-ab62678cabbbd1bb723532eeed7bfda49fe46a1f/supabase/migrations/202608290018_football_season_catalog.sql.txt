create table if not exists public.football_provider_seasons (
  provider text not null,
  provider_league_id bigint not null,
  provider_season_id bigint not null,
  season_name text not null,
  finished boolean not null default false,
  pending boolean not null default false,
  is_current boolean not null default false,
  starting_at date,
  ending_at date,
  discovered_at timestamptz not null default now(),
  primary key (provider, provider_season_id)
);

create index if not exists football_provider_seasons_league_idx
  on public.football_provider_seasons (
    provider,
    provider_league_id,
    starting_at desc
  );

alter table public.football_provider_seasons enable row level security;
revoke all on public.football_provider_seasons
  from public, anon, authenticated;
grant all on public.football_provider_seasons to service_role;

comment on table public.football_provider_seasons is
  'Server-side catalog of provider season identifiers used by repeatable historical backfills.';

create or replace function public.invoke_football_data_sync(
  request_body jsonb default '{}'::jsonb
)
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
    raise exception 'KickON football sync Vault secrets are missing';
  end if;

  function_url := regexp_replace(
    live_function_url,
    '/sync-live-football$',
    '/sync-football-data'
  );

  select net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sync-secret', sync_secret
    ),
    body := coalesce(request_body, '{}'::jsonb),
    timeout_milliseconds := 120000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function public.invoke_football_data_sync(jsonb)
  from public, anon, authenticated;
grant execute on function public.invoke_football_data_sync(jsonb)
  to service_role;

comment on function public.invoke_football_data_sync(jsonb) is
  'Queues the protected full-football Edge Function with an internal scheduler secret.';

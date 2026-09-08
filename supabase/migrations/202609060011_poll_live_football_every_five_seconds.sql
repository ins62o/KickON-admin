-- Poll K League 1 live fixtures at five-second intervals for the duration of
-- each minute. The Edge Function performs one initial snapshot plus eleven
-- incremental snapshots and normally completes in about 55 seconds.
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
    body := jsonb_build_object('pollCount', 11),
    timeout_milliseconds := 85000
  );
exception
  when others then
    raise warning 'KickON live football sync enqueue failed: %', sqlerrm;
end;
$$;
revoke all on function public.invoke_live_football_sync()
  from public, anon, authenticated;

comment on function public.invoke_live_football_sync() is
  'Invokes the K League 1 live sync with eleven five-second incremental polls per minute.';

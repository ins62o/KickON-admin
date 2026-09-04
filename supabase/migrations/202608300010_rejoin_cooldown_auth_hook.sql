create or replace function public.enforce_account_rejoin_cooldown(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_name text := lower(nullif(
    trim(coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', '')),
    ''
  ));
  provider_subject text := nullif(
    trim(coalesce(
      event -> 'user' -> 'user_metadata' ->> 'sub',
      event -> 'user' -> 'user_metadata' ->> 'provider_id',
      ''
    )),
    ''
  );
  normalized_email text := nullif(
    lower(trim(coalesce(event -> 'user' ->> 'email', ''))),
    ''
  );
  active_block_until timestamptz;
begin
  delete from public.account_rejoin_cooldowns
  where blocked_until <= now();

  select max(cooldown.blocked_until)
  into active_block_until
  from public.account_rejoin_cooldowns cooldown
  where cooldown.blocked_until > now()
    and cooldown.identity_hash in (
      public.account_identity_hash(provider_name, provider_subject),
      public.account_identity_hash('email', normalized_email)
    );

  if active_block_until is not null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 429,
        'message', 'REJOIN_COOLDOWN_ACTIVE'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.enforce_account_rejoin_cooldown(jsonb)
  to supabase_auth_admin;
revoke execute on function public.enforce_account_rejoin_cooldown(jsonb)
  from authenticated, anon, public;

comment on function public.enforce_account_rejoin_cooldown(jsonb) is
  'Before-user-created auth hook that returns a stable app-facing error while the seven-day rejoin cooldown is active.';

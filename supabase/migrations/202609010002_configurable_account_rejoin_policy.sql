create table public.account_rejoin_policy (
  id smallint primary key default 1,
  cooldown_days smallint not null default 7,
  updated_at timestamptz not null default now(),
  constraint account_rejoin_policy_singleton_check check (id = 1),
  constraint account_rejoin_policy_days_check
    check (cooldown_days between 0 and 365)
);

insert into public.account_rejoin_policy (id, cooldown_days)
values (1, 7)
on conflict (id) do nothing;

alter table public.account_rejoin_policy enable row level security;
revoke all on public.account_rejoin_policy from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_name text := lower(nullif(
    trim(coalesce(new.raw_app_meta_data ->> 'provider', '')),
    ''
  ));
  provider_subject text := nullif(
    trim(coalesce(
      new.raw_user_meta_data ->> 'sub',
      new.raw_user_meta_data ->> 'provider_id',
      ''
    )),
    ''
  );
  normalized_email text := nullif(lower(trim(coalesce(new.email, ''))), '');
  active_block_until timestamptz;
  configured_cooldown_days smallint;
begin
  select policy.cooldown_days
  into configured_cooldown_days
  from public.account_rejoin_policy policy
  where policy.id = 1;

  if coalesce(configured_cooldown_days, 7) > 0 then
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
      raise exception 'REJOIN_COOLDOWN_ACTIVE'
        using detail = active_block_until::text;
    end if;
  end if;

  insert into public.profiles (id, nickname)
  values (new.id, '');
  insert into public.notification_preferences (user_id)
  values (new.id);
  return new;
end;
$$;

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
  configured_cooldown_days smallint;
begin
  select policy.cooldown_days
  into configured_cooldown_days
  from public.account_rejoin_policy policy
  where policy.id = 1;

  if coalesce(configured_cooldown_days, 7) <= 0 then
    return '{}'::jsonb;
  end if;

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

comment on table public.account_rejoin_policy is
  'Server-only account recreation policy. Production defaults to seven days; development sets zero through an environment operation.';

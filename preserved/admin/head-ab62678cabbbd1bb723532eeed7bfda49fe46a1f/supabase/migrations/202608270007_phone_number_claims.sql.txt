create table public.phone_number_claims (
  phone_hash bytea primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);

alter table public.phone_number_claims enable row level security;
revoke all on public.phone_number_claims from anon, authenticated;

create or replace function public.normalize_korean_phone_number(phone_number text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  digits text := regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g');
  normalized text;
begin
  normalized := case
    when digits like '82%' then '+' || digits
    when digits like '0%' then '+82' || substring(digits from 2)
    else '+' || digits
  end;

  if normalized !~ '^\+821(0|1|6|7|8|9)[0-9]{7,8}$' then
    raise exception 'PHONE_NUMBER_INVALID';
  end if;

  return normalized;
end;
$$;

create or replace function public.reserve_phone_number(phone_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_phone text;
  hashed_phone bytea;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  normalized_phone := public.normalize_korean_phone_number(phone_number);
  hashed_phone := extensions.digest(normalized_phone, 'sha256');

  delete from public.phone_number_claims
  where verified_at is null
    and expires_at < now();

  if exists (
    select 1
    from auth.users
    where phone = normalized_phone
      and id <> current_user_id
  ) then
    raise exception 'PHONE_ALREADY_REGISTERED';
  end if;

  if exists (
    select 1
    from auth.users
    where phone_change = normalized_phone
      and id <> current_user_id
      and phone_change_sent_at > now() - interval '15 minutes'
  ) then
    raise exception 'PHONE_VERIFICATION_IN_PROGRESS';
  end if;

  delete from public.phone_number_claims
  where user_id = current_user_id
    and verified_at is null;

  begin
    insert into public.phone_number_claims (
      phone_hash,
      user_id,
      reserved_at,
      expires_at
    ) values (
      hashed_phone,
      current_user_id,
      now(),
      now() + interval '10 minutes'
    );
  exception
    when unique_violation then
      raise exception 'PHONE_ALREADY_REGISTERED';
  end;
end;
$$;

create or replace function public.release_phone_number_reservation()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.phone_number_claims
  where user_id = auth.uid()
    and verified_at is null;
$$;

create or replace function public.complete_signup()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  verified_phone text;
  phone_verified_at timestamptz;
  hashed_phone bytea;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select phone, phone_confirmed_at
  into verified_phone, phone_verified_at
  from auth.users
  where id = current_user_id;

  if verified_phone is null or phone_verified_at is null then
    raise exception 'PHONE_NOT_VERIFIED';
  end if;

  hashed_phone := extensions.digest(verified_phone, 'sha256');

  if exists (
    select 1
    from public.phone_number_claims
    where phone_hash = hashed_phone
      and user_id <> current_user_id
  ) then
    raise exception 'PHONE_ALREADY_REGISTERED';
  end if;

  update public.phone_number_claims
  set
    verified_at = coalesce(verified_at, now()),
    expires_at = 'infinity'::timestamptz
  where phone_hash = hashed_phone
    and user_id = current_user_id;

  if not found then
    insert into public.phone_number_claims (
      phone_hash,
      user_id,
      expires_at,
      verified_at
    ) values (
      hashed_phone,
      current_user_id,
      'infinity'::timestamptz,
      now()
    );
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id;

  if current_profile.signup_consented_at is null
    or current_profile.terms_version is null
    or current_profile.privacy_version is null
    or current_profile.community_policy_version is null
    or current_profile.age_confirmed_at is null then
    raise exception 'REQUIRED_CONSENTS_MISSING';
  end if;

  update public.profiles
  set registration_completed_at = coalesce(registration_completed_at, now())
  where id = current_user_id
  returning * into current_profile;

  return current_profile;
end;
$$;

revoke all on function public.normalize_korean_phone_number(text) from public;
revoke all on function public.reserve_phone_number(text) from public;
revoke all on function public.release_phone_number_reservation() from public;

grant execute on function public.reserve_phone_number(text) to authenticated;
grant execute on function public.release_phone_number_reservation() to authenticated;

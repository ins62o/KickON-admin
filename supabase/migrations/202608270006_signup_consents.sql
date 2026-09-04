alter table public.profiles
  add column signup_consented_at timestamptz,
  add column terms_version text,
  add column privacy_version text,
  add column community_policy_version text,
  add column age_confirmed_at timestamptz,
  add column registration_completed_at timestamptz;

alter table public.notification_preferences
  alter column match_notifications_enabled set default false,
  alter column lineup_notifications_enabled set default false,
  alter column community_notifications_enabled set default false;

create table public.user_consents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (
    document_type in ('TERMS', 'PRIVACY', 'COMMUNITY', 'AGE', 'NOTIFICATIONS')
  ),
  document_version text not null,
  agreed boolean not null,
  agreed_at timestamptz not null default now(),
  primary key (user_id, document_type, document_version)
);

alter table public.user_consents enable row level security;

revoke all on public.user_consents from anon, authenticated;
grant select on public.user_consents to authenticated;

create policy "users read own consents"
on public.user_consents
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.accept_signup_consents(
  terms_document_version text,
  privacy_document_version text,
  community_document_version text,
  age_document_version text,
  notifications_document_version text,
  notifications_enabled boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  accepted_at timestamptz := now();
  updated_profile public.profiles;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if nullif(trim(terms_document_version), '') is null
    or nullif(trim(privacy_document_version), '') is null
    or nullif(trim(community_document_version), '') is null
    or nullif(trim(age_document_version), '') is null
    or nullif(trim(notifications_document_version), '') is null then
    raise exception 'CONSENT_VERSION_REQUIRED';
  end if;

  insert into public.user_consents (
    user_id,
    document_type,
    document_version,
    agreed,
    agreed_at
  ) values
    (current_user_id, 'TERMS', terms_document_version, true, accepted_at),
    (current_user_id, 'PRIVACY', privacy_document_version, true, accepted_at),
    (current_user_id, 'COMMUNITY', community_document_version, true, accepted_at),
    (current_user_id, 'AGE', age_document_version, true, accepted_at),
    (
      current_user_id,
      'NOTIFICATIONS',
      notifications_document_version,
      notifications_enabled,
      accepted_at
    )
  on conflict (user_id, document_type, document_version)
  do update set
    agreed = excluded.agreed,
    agreed_at = excluded.agreed_at;

  update public.notification_preferences
  set
    match_notifications_enabled = notifications_enabled,
    lineup_notifications_enabled = notifications_enabled,
    community_notifications_enabled = notifications_enabled
  where user_id = current_user_id;

  update public.profiles
  set
    signup_consented_at = accepted_at,
    terms_version = terms_document_version,
    privacy_version = privacy_document_version,
    community_policy_version = community_document_version,
    age_confirmed_at = accepted_at
  where id = current_user_id
  returning * into updated_profile;

  return updated_profile;
end;
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
  phone_verified_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select phone_confirmed_at
  into phone_verified_at
  from auth.users
  where id = current_user_id;

  if phone_verified_at is null then
    raise exception 'PHONE_NOT_VERIFIED';
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

revoke all on function public.accept_signup_consents(
  text, text, text, text, text, boolean
) from public;
grant execute on function public.accept_signup_consents(
  text, text, text, text, text, boolean
) to authenticated;

revoke all on function public.complete_signup() from public;
grant execute on function public.complete_signup() to authenticated;

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
    age_confirmed_at = accepted_at,
    registration_completed_at = coalesce(registration_completed_at, accepted_at)
  where id = current_user_id
  returning * into updated_profile;

  return updated_profile;
end;
$$;

update public.profiles
set registration_completed_at = coalesce(
  registration_completed_at,
  signup_consented_at,
  now()
)
where signup_consented_at is not null
  and terms_version is not null
  and privacy_version is not null
  and community_policy_version is not null
  and age_confirmed_at is not null
  and registration_completed_at is null;

drop function if exists public.complete_signup();
drop function if exists public.reserve_phone_number(text);
drop function if exists public.release_phone_number_reservation();
drop function if exists public.normalize_korean_phone_number(text);
drop table if exists public.phone_number_claims;

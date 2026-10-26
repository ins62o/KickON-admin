alter table public.push_tokens
  add column if not exists apns_environment text,
  add column if not exists bundle_id text;

update public.push_tokens
set
  apns_environment = 'development',
  bundle_id = 'com.inseong.kickon.dev'
where platform = 'ios'
  and (apns_environment is null or bundle_id is null);

alter table public.push_tokens
  drop constraint if exists push_tokens_apns_configuration_check;
alter table public.push_tokens
  add constraint push_tokens_apns_configuration_check
  check (
    platform <> 'ios'
    or (
      (apns_environment = 'development' and bundle_id = 'com.inseong.kickon.dev')
      or
      (apns_environment = 'production' and bundle_id = 'com.inseong.kickon')
    )
  );

create or replace function public.register_push_token(
  device_token text,
  device_platform text,
  device_apns_environment text,
  device_bundle_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if device_platform not in ('ios', 'android') then
    raise exception 'INVALID_PUSH_PLATFORM';
  end if;
  if char_length(device_token) < 16 or char_length(device_token) > 4096 then
    raise exception 'INVALID_PUSH_TOKEN';
  end if;
  if device_platform = 'ios' and not (
    (device_apns_environment = 'development'
      and device_bundle_id = 'com.inseong.kickon.dev')
    or
    (device_apns_environment = 'production'
      and device_bundle_id = 'com.inseong.kickon')
  ) then
    raise exception 'INVALID_APNS_CONFIGURATION';
  end if;

  delete from public.push_tokens where token = device_token;
  insert into public.push_tokens (
    token,
    user_id,
    platform,
    apns_environment,
    bundle_id,
    updated_at
  ) values (
    device_token,
    auth.uid(),
    device_platform,
    case when device_platform = 'ios' then device_apns_environment end,
    case when device_platform = 'ios' then device_bundle_id end,
    now()
  );
end;
$$;

revoke all on function public.register_push_token(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text, text, text)
  to authenticated;

create or replace function public.register_push_token(
  device_token text,
  device_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.register_push_token(
    device_token,
    device_platform,
    case when device_platform = 'ios' then 'development' end,
    case when device_platform = 'ios' then 'com.inseong.kickon.dev' end
  );
end;
$$;

revoke all on function public.register_push_token(text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text)
  to authenticated;

comment on column public.push_tokens.apns_environment is
  'APNs routing environment for an iOS token: development or production.';
comment on column public.push_tokens.bundle_id is
  'APNs topic associated with the device token.';

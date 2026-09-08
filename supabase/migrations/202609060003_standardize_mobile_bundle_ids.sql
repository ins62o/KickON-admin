-- APNs tokens are scoped to an app topic and cannot be transferred to a new
-- bundle identifier. Clients will register fresh tokens after installing the
-- renamed app.
delete from public.push_tokens
where platform = 'ios'
  and bundle_id in ('com.inseong.kickon.dev', 'com.inseong.kickon');
alter table public.push_tokens
  drop constraint if exists push_tokens_apns_configuration_check;
alter table public.push_tokens
  add constraint push_tokens_apns_configuration_check
  check (
    platform <> 'ios'
    or (
      (apns_environment = 'development' and bundle_id = 'kr.kickon.dev')
      or
      (apns_environment = 'production' and bundle_id = 'kr.kickon.app')
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
      and device_bundle_id = 'kr.kickon.dev')
    or
    (device_apns_environment = 'production'
      and device_bundle_id = 'kr.kickon.app')
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
    case when device_platform = 'ios' then 'kr.kickon.dev' end
  );
end;
$$;
revoke all on function public.register_push_token(text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_token(text, text)
  to authenticated;
comment on column public.push_tokens.bundle_id is
  'APNs topic: kr.kickon.dev for development or kr.kickon.app for production.';

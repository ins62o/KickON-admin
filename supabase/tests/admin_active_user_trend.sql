-- Run against an installed contract. This test never inserts activity or accounts.
begin;
set local statement_timeout = '30s';

do $verify$
declare
  administrator uuid;
  result jsonb;
  expected_dau bigint;
  expected_mau bigint;
  expected_start date;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select member.user_id into administrator from public.admin_users member
  where member.is_active and member.role::text in ('admin','super_admin') limit 1;
  if administrator is null then raise exception 'Existing administrator required for contract verification'; end if;

  select count(distinct activity.user_id) filter(where activity.activity_date=today),
         count(distinct activity.user_id)
  into expected_dau,expected_mau
  from public.app_daily_activity activity
  where activity.activity_date between today-29 and today
    and not exists(select 1 from public.admin_users member where member.user_id=activity.user_id)
    and not exists(select 1 from auth.identities identity where identity.user_id=activity.user_id and lower(identity.provider)='email');
  select min(activity_date) into expected_start from public.app_daily_activity;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  execute 'set local role authenticated';
  result:=public.admin_get_active_user_trend();
  if result->>'today'<>today::text or jsonb_array_length(result->'daily')<>180 then
    raise exception 'Expected 180 Korea-time chart days';
  end if;
  if (result->>'trackingStartedOn')::date is distinct from expected_start then
    raise exception 'Tracking start must match the actual ledger';
  end if;
  if (result->'daily'->179->>'date')<>today::text
    or (result->'daily'->179->>'dau')::bigint<>expected_dau
    or (result->'daily'->179->>'mau')::bigint<>expected_mau then
    raise exception 'Latest DAU or 30-day MAU does not match recorded members';
  end if;
  if exists(select 1 from jsonb_array_elements(result->'daily') day
    where (day->>'dau')::bigint<0 or (day->>'dau')::bigint>(day->>'mau')::bigint) then
    raise exception 'Invalid daily counts';
  end if;
  execute 'reset role';

  if has_function_privilege('anon','public.admin_get_active_user_trend()','execute')
    or has_function_privilege('anon','public.record_app_activity(text)','execute') then
    raise exception 'Anonymous execution must be denied';
  end if;
  if has_table_privilege('authenticated','public.app_daily_activity','select')
    or has_table_privilege('authenticated','public.app_daily_activity','insert') then
    raise exception 'Direct member ledger access must be denied';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.app_daily_activity'::regclass) then
    raise exception 'Activity RLS must remain enabled';
  end if;

  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role authenticated';
  begin
    perform public.admin_get_active_user_trend();
    raise exception 'Unverified identity was allowed to read dashboard';
  exception when raise_exception then
    if sqlerrm<>'DASHBOARD_PERMISSION_REQUIRED' then raise; end if;
  end;
  begin
    perform public.record_app_activity(null);
    raise exception 'Unverified identity was allowed to record activity';
  exception when raise_exception then
    if sqlerrm<>'AUTH_REQUIRED' then raise; end if;
  end;
  execute 'reset role';
end;
$verify$;
select 'PASS: active-user aggregates, existing administrator, denied anonymous/unverified access and ledger RLS' as result;
rollback;

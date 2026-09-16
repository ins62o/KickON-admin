-- Development QA only. Every release/audit change is rolled back.
-- Run as postgres in the DEVELOPMENT SQL Editor, never in production.
begin;

do $$
declare
  actor uuid;
  old_audits bigint;
  entry jsonb;
begin
  if to_regprocedure('public.admin_set_app_store_release(text,text,boolean,text)') is null then
    raise exception 'RPC missing';
  end if;
  if has_function_privilege('anon', 'public.admin_set_app_store_release(text,text,boolean,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.admin_set_app_store_release(text,text,boolean,text)', 'execute') then
    raise exception 'Incorrect RPC grants';
  end if;
  if has_table_privilege('anon', 'public.app_store_releases', 'insert,update,delete')
     or has_table_privilege('authenticated', 'public.app_store_releases', 'insert,update,delete') then
    raise exception 'Direct client writes permitted';
  end if;
  select count(*) into old_audits from public.admin_audit_logs where entity_type = 'app_store_releases';
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.admin_set_app_store_release('android','1.0.3',true,'[APP-UPDATE-QA] anonymous denied');
    raise exception 'Anonymous write accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000016"}', true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000016', true);
  begin
    perform public.admin_set_app_store_release('ios','1.0.3',true,'[APP-UPDATE-QA] non-admin denied');
    raise exception 'Non-admin write accepted';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.admin_audit_logs where entity_type = 'app_store_releases') <> old_audits then
    raise exception 'Denied request wrote audit';
  end if;
  select user_id into actor from public.admin_users where is_active and role::text in ('admin','super_admin') limit 1;
  if actor is null then raise exception 'No existing administrator for QA'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',actor)::text, true);
  perform set_config('request.jwt.claim.sub', actor::text, true);
  begin
    perform public.admin_set_app_store_release('windows','1.0.3',true,'[APP-UPDATE-QA] invalid platform');
    raise exception 'Invalid platform accepted';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_RELEASE' then raise; end if;
  end;
  begin
    perform public.admin_set_app_store_release('ios','1.0.3-beta',true,'[APP-UPDATE-QA] invalid version');
    raise exception 'Invalid version accepted';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_RELEASE' then raise; end if;
  end;
  begin
    perform public.admin_set_app_store_release('ios','1.0.3',true,'  ');
    raise exception 'Empty reason accepted';
  exception when raise_exception then
    if sqlerrm <> 'INVALID_RELEASE' then raise; end if;
  end;
  perform public.admin_set_app_store_release('android','1.0.3',true,'[APP-UPDATE-QA] Android enable');
  perform public.admin_set_app_store_release('ios','1.0.4',true,'[APP-UPDATE-QA] iOS enable');
  perform public.admin_set_app_store_release('ios','1.0.4',false,'[APP-UPDATE-QA] iOS disable');
  if not exists(select 1 from public.app_store_releases where platform='android' and version='1.0.3' and enabled)
     or not exists(select 1 from public.app_store_releases where platform='ios' and version='1.0.4' and not enabled) then
    raise exception 'Independent platform settings failed';
  end if;
  if (select count(*) from public.admin_audit_logs where entity_type='app_store_releases') <> old_audits + 3 then
    raise exception 'Audit count incorrect';
  end if;
  select to_jsonb(a) into entry from public.admin_audit_logs a
    where entity_type='app_store_releases' and reason='[APP-UPDATE-QA] iOS disable'
    order by id desc limit 1;
  if entry->>'actor_id' <> actor::text or entry->>'action' <> 'UPDATE'
     or entry->'before_value'->>'enabled' <> 'true'
     or entry->'after_value'->>'enabled' <> 'false' then
    raise exception 'Audit actor/before/after incorrect';
  end if;
end;
$$;

set local role anon;
do $$
begin
  if not exists(select 1 from public.app_store_releases where platform='android')
     or exists(select 1 from public.app_store_releases where platform='ios') then
    raise exception 'Public enabled-only RLS failed';
  end if;
end;
$$;
reset role;
select 'PASS: administrator RPC, denied writes, validation, independent settings, audit, public RLS; all changes rolled back' as verification;
rollback;

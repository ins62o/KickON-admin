-- Run only in the DEVELOPMENT SQL Editor as postgres. All settings roll back.
begin;
do $$
declare actor uuid; source_id bigint; cancel_id bigint; old_id bigint; v jsonb;
begin
  if has_function_privilege('anon','public.admin_cancel_app_store_release(text,bigint,text)','execute') then raise exception 'Anon execute allowed'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000016',true);
  begin
    perform public.admin_cancel_app_store_release('android',1,'[CANCEL-QA] denied');
    raise exception 'Non-admin accepted';
  exception when insufficient_privilege then null; end;
  select user_id into actor from public.admin_users where is_active and role::text in ('admin','super_admin') limit 1;
  if actor is null then raise exception 'No admin'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.admin_set_app_store_release('android','1.0.2',false,'[CANCEL-QA] baseline');
  select id into old_id from public.admin_audit_logs where entity_type='app_store_releases' and entity_id='android' order by id desc limit 1;
  perform public.admin_set_app_store_release('android','1.0.3',true,'[CANCEL-QA] mistaken save');
  select id into source_id from public.admin_audit_logs where entity_type='app_store_releases' and entity_id='android' order by id desc limit 1;
  begin
    perform public.admin_cancel_app_store_release('android',old_id,'[CANCEL-QA] stale denied');
    raise exception 'Stale cancellation accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.admin_cancel_app_store_release('ios',source_id,'[CANCEL-QA] cross-platform denied');
    raise exception 'Cross-platform cancellation accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.admin_cancel_app_store_release('android',source_id,' ');
    raise exception 'Empty reason accepted';
  exception when raise_exception then if sqlerrm <> 'INVALID_RELEASE' then raise; end if; end;
  perform public.admin_cancel_app_store_release('android',source_id,'[CANCEL-QA] cancel');
  if not exists(select 1 from public.app_store_releases where platform='android' and version='1.0.2' and not enabled) then raise exception 'Restore failed'; end if;
  select to_jsonb(a) into v from public.admin_audit_logs a where entity_type='app_store_releases' and entity_id='android' order by id desc limit 1;
  if v->>'action' <> 'APP_RELEASE_CANCEL' or v->>'actor_id' <> actor::text
    or v->>'reason' <> '[CANCEL-QA] cancel' or v->'before_value'->>'version' <> '1.0.3'
    or v->'after_value'->>'version' <> '1.0.2' then raise exception 'Cancellation audit failed'; end if;
  cancel_id := (v->>'id')::bigint;
  begin
    perform public.admin_cancel_app_store_release('android',cancel_id,'[CANCEL-QA] repeat denied');
    raise exception 'Repeated cancellation accepted';
  exception when serialization_failure then null; end;
  -- Model a first registration without deleting any existing setting.
  perform public.admin_set_app_store_release('android','1.0.9',true,'[CANCEL-QA] first registration fixture');
  select id into source_id from public.admin_audit_logs where entity_type='app_store_releases' and entity_id='android' order by id desc limit 1;
  update public.admin_audit_logs set before_value=null, action='INSERT' where id=source_id;
  perform public.admin_cancel_app_store_release('android',source_id,'[CANCEL-QA] first registration cancel');
  if not exists(select 1 from public.app_store_releases where platform='android' and version='1.0.9' and not enabled) then raise exception 'First registration cancellation failed'; end if;
end $$;
select 'PASS: restore, first registration disables, audit, stale/repeated/cross-platform/non-admin denial; rolled back' as verification;
rollback;

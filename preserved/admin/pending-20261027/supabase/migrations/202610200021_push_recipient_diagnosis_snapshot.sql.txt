-- Observe the existing dispatch flow without changing recipient selection or send policy.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $guard$
begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.materialize_push_delivery_targets(uuid,uuid)') and md5(prosrc) in ('6e382e183581d67407eea1d8bdb58295','9d37330f6fd0c0c7afe7927a9288a258')) then
  raise exception 'PUSH_DIAGNOSIS_SOURCE_MISMATCH: materialize_push_delivery_targets';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.get_admin_push_delivery_detail(uuid)') and md5(prosrc) in ('269613d480debc357ff45892590e6cc5')) then
  raise exception 'PUSH_DIAGNOSIS_SOURCE_MISMATCH: get_admin_push_delivery_detail';
 end if;
end;
$guard$;
alter table public.push_outbox add column recipient_diagnosis jsonb;
comment on column public.push_outbox.recipient_diagnosis is
 'First target-selection/early-closure observation only; never backfilled or overwritten. No device credentials or OS permission inference.';

create function public.capture_push_recipient_diagnosis()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_capture boolean := false;
 v_selected integer;
 v_registered integer;
 v_duplicates integer;
 v_type text;
 v_phase text;
 v_pref public.notification_preferences%rowtype;
 v_pref_exists boolean;
begin
 if tg_op='UPDATE' then
  if old.recipient_diagnosis is not null then
   if new.recipient_diagnosis is distinct from old.recipient_diagnosis then raise exception 'PUSH_RECIPIENT_DIAGNOSIS_IMMUTABLE'; end if;
   return new;
  end if;
  if new.recipient_diagnosis is not null then raise exception 'PUSH_RECIPIENT_DIAGNOSIS_SERVER_ONLY'; end if;
  -- Old materialized/terminal work has no trustworthy historical observation.
  if old.targets_materialized_at is not null or old.status not in ('PENDING','PROCESSING','RETRY') then return new; end if;
  v_capture := new.targets_materialized_at is not null
   or new.status in ('COMPLETED','SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER','UNKNOWN_OUTCOME');
 else
  v_capture := new.status in ('SUPPRESSED','DISMISSED','SHADOWED','DEAD_LETTER');
 end if;
 if new.recipient_diagnosis is not null then raise exception 'PUSH_RECIPIENT_DIAGNOSIS_SERVER_ONLY'; end if;
 if not v_capture then return new; end if;

 select n.type::text,n.data->>'phase' into v_type,v_phase
 from public.notifications n where n.id=new.notification_id and n.user_id=new.user_id;
 select p.* into v_pref from public.notification_preferences p where p.user_id=new.user_id;
 v_pref_exists := found;
 if new.targets_materialized_at is not null then
  select count(*) into v_selected from public.push_delivery_targets t where t.outbox_id=new.id;
  v_duplicates := new.duplicate_suppressed_count;
  -- Materialization selects every registered token, enforces its bound, then deduplicates.
  -- These counts use the frozen selection, never a second mutable push_tokens read.
  v_registered := v_selected + v_duplicates;
 end if;
 new.recipient_diagnosis := jsonb_build_object(
  'version',1,'captured_at',clock_timestamp(),
  'stage',case when new.targets_materialized_at is not null then 'target_selection' else 'closed_before_selection' end,
  'notification_type',v_type,'phase',v_phase,'preference_exists',v_pref_exists,
  'match_enabled',v_pref.match_notifications_enabled,'goal_enabled',v_pref.goal_notifications_enabled,
  'lineup_enabled',v_pref.lineup_notifications_enabled,'community_enabled',v_pref.community_notifications_enabled,
  'registered_devices',v_registered,'selected_devices',v_selected,'duplicate_devices',v_duplicates,
  'outcome',case when v_selected=0 then 'NO_REGISTERED_DEVICE' when v_selected>0 then 'TARGETS_SELECTED' else 'CLOSED_BEFORE_SELECTION' end
 );
 return new;
end;
$$;
revoke all on function public.capture_push_recipient_diagnosis() from public,anon,authenticated,service_role;
create trigger push_recipient_diagnosis_capture
 before insert or update of status,targets_materialized_at,recipient_diagnosis on public.push_outbox
 for each row execute function public.capture_push_recipient_diagnosis();

create or replace function public.get_admin_push_delivery_detail(p_outbox_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_outbox_id is null then raise exception 'INVALID_PUSH_DELIVERY'; end if;
 select jsonb_build_object(
  'recipient_diagnosis',o.recipient_diagnosis,
  'current_preference',case when context.type='MATCH' and context.phase in ('GOAL','GOAL_CANCELLED') then pref.goal_notifications_enabled
   when context.type in ('MATCH','ATTENDANCE') then pref.match_notifications_enabled
   when context.type='LINEUP' then pref.lineup_notifications_enabled when context.type='COMMUNITY' then pref.community_notifications_enabled end,
  'status',o.status,'created_at',o.created_at,'completed_at',o.completed_at,'last_error_code',o.last_error_code,
  'last_attempted_at',a.last_attempted_at,'last_success_at',coalesce(a.last_success_at,t.last_success_at),'attempts',a.attempts,
  'targets',t.targets,'succeeded',t.succeeded,'failed',t.failed,'pending',t.pending,'unknown',t.unknown,'shadowed',t.shadowed,'suppressed',t.suppressed,
  'reasons',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'count',r.count) order by r.count desc,r.code) from (
   select last_error_code as code,count(*) as count from public.push_delivery_targets
   where outbox_id=o.id and status<>'SUCCEEDED' and nullif(btrim(last_error_code),'') is not null group by last_error_code
  ) r),case when coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code) is not null then jsonb_build_array(jsonb_build_object('code',coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code),'count',null)) else '[]'::jsonb end)
 ) into result
 from public.push_outbox o
 left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
 left join public.notification_preferences pref on pref.user_id=o.user_id
 cross join lateral (select coalesce(n.type::text,case
  when split_part(o.effect_key,':',1) in ('fixture-live','fixture-halftime','fixture-second-half','fixture-finished','fixture-goal','fixture-goal-cancelled') then 'MATCH'
  when split_part(o.effect_key,':',1)='fixture-lineup' then 'LINEUP'
  when split_part(o.effect_key,':',1)='attendance-reminder' then 'ATTENDANCE'
  when split_part(o.effect_key,':',1) in ('comment','comment-reply','post-like') then 'COMMUNITY' end) as type,
  coalesce(n.data->>'phase',case when split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then 'GOAL' end) as phase) context
 cross join lateral (select count(*) as targets,count(*) filter(where status='SUCCEEDED') as succeeded,
  count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
  count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
  count(*) filter(where status='SHADOWED') as shadowed,count(*) filter(where status='SUPPRESSED') as suppressed,
  max(completed_at) filter(where status='SUCCEEDED') as last_success_at
  from public.push_delivery_targets where outbox_id=o.id) t
 cross join lateral (select count(*) as attempts,max(attempted_at) as last_attempted_at,
  max(completed_at) filter(where status='SUCCEEDED') as last_success_at,
  (array_agg(error_code order by attempted_at desc,id desc) filter(where nullif(btrim(error_code),'') is not null))[1] as last_error_code
  from public.push_delivery_attempts where outbox_id=o.id) a
 where o.id=p_outbox_id;
 if result is null then raise exception 'PUSH_DELIVERY_NOT_FOUND'; end if;
 return result;
end;
$$;
revoke all on function public.get_admin_push_delivery_detail(uuid) from public,anon,authenticated;
grant execute on function public.get_admin_push_delivery_detail(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

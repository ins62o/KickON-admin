begin;
create or replace function public.get_admin_push_delivery_detail(p_outbox_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_outbox_id is null then raise exception 'INVALID_PUSH_DELIVERY'; end if;
 select jsonb_build_object(
  'status',o.status,'created_at',o.created_at,'completed_at',o.completed_at,'last_error_code',o.last_error_code,
  'last_attempted_at',a.last_attempted_at,'last_success_at',coalesce(a.last_success_at,t.last_success_at),'attempts',a.attempts,
  'targets',t.targets,'succeeded',t.succeeded,'failed',t.failed,'pending',t.pending,'unknown',t.unknown,'shadowed',t.shadowed,'suppressed',t.suppressed,
  'reasons',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'count',r.count) order by r.count desc,r.code) from (
   select last_error_code as code,count(*) as count from public.push_delivery_targets
   where outbox_id=o.id and status<>'SUCCEEDED' and nullif(btrim(last_error_code),'') is not null group by last_error_code
  ) r),case when coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code) is not null then jsonb_build_array(jsonb_build_object('code',coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code),'count',null)) else '[]'::jsonb end)
 ) into result
 from public.push_outbox o
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

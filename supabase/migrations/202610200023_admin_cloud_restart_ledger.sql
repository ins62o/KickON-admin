begin;
create table public.admin_project_restart_requests(
 id uuid primary key, project text not null, actor uuid not null,
 environment text not null check(environment in ('development','production')),
 requested_at timestamptz not null default clock_timestamp(),
 status text not null check(status in ('pending','accepted','unknown','failed')),
 updated_at timestamptz not null default clock_timestamp()
);
create index admin_project_restart_requests_project_time on public.admin_project_restart_requests(project,requested_at desc);
alter table public.admin_project_restart_requests enable row level security;
revoke all on public.admin_project_restart_requests from public,anon,authenticated,service_role;

create function public.admin_project_restart_record(p_row public.admin_project_restart_requests)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p_row.id,'project',p_row.project,'actor',p_row.actor,
  'environment',p_row.environment,'requestedAt',floor(extract(epoch from p_row.requested_at)*1000),'status',p_row.status)
$$;
revoke all on function public.admin_project_restart_record(public.admin_project_restart_requests) from public,anon,authenticated;

create function public.admin_project_restart_reserve(p_project text,p_actor uuid,p_environment text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.admin_project_restart_requests;
begin
 if coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_project is null or p_project !~ '^https://[a-z0-9]{20}\.supabase\.co$'
  or p_actor is null or p_request_id is null or p_environment is null or p_environment not in ('development','production') then raise exception 'INVALID_RESTART'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project,0));
 select * into r from public.admin_project_restart_requests where id=p_request_id;
 if found then
  if r.project<>p_project or r.actor<>p_actor or r.environment<>p_environment then return jsonb_build_object('kind','conflict'); end if;
  return jsonb_build_object('kind','existing','record',public.admin_project_restart_record(r));
 end if;
 select * into r from public.admin_project_restart_requests where project=p_project
  and status<>'failed' and requested_at>clock_timestamp()-interval '5 minutes' order by requested_at desc limit 1;
 if found then return jsonb_build_object('kind','cooldown','record',public.admin_project_restart_record(r)); end if;
 insert into public.admin_project_restart_requests(id,project,actor,environment,status)
  values(p_request_id,p_project,p_actor,p_environment,'pending') returning * into r;
 return jsonb_build_object('kind','new','record',public.admin_project_restart_record(r));
end;
$$;
create function public.admin_project_restart_finish(p_request_id uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 if p_status is null or p_status not in ('accepted','unknown','failed') then raise exception 'INVALID_RESTART_STATUS'; end if;
 update public.admin_project_restart_requests set status=p_status,updated_at=clock_timestamp() where id=p_request_id and status='pending';
 if not found then raise exception 'RESTART_RESERVATION_REQUIRED'; end if;
end;
$$;
create function public.admin_project_restart_latest(p_project text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.admin_project_restart_requests;
begin
 if coalesce((select auth.role()),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into r from public.admin_project_restart_requests where project=p_project and status<>'failed' order by requested_at desc limit 1;
 if not found then return null; end if;
 return public.admin_project_restart_record(r);
end;
$$;
revoke all on function public.admin_project_restart_reserve(text,uuid,text,uuid),public.admin_project_restart_finish(uuid,text),public.admin_project_restart_latest(text) from public,anon,authenticated;
grant execute on function public.admin_project_restart_reserve(text,uuid,text,uuid),public.admin_project_restart_finish(uuid,text),public.admin_project_restart_latest(text) to service_role;
notify pgrst,'reload schema';
commit;

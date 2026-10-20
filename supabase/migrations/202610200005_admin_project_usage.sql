create table if not exists public.admin_project_usage (
 id boolean primary key default true check(id),
 snapshot jsonb,
 attempted_at timestamptz not null,
 status text not null check(status in ('success','error'))
);
alter table public.admin_project_usage enable row level security;
revoke all on public.admin_project_usage from public,anon,authenticated;
grant select,insert,update on public.admin_project_usage to service_role;

create or replace function public.admin_record_project_usage(p_snapshot jsonb,p_attempted_at timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_attempted_at is null or abs(extract(epoch from clock_timestamp()-p_attempted_at))>120 then raise exception 'Invalid collection time'; end if;
 if p_snapshot is not null and (jsonb_typeof(p_snapshot)<>'object' or not(p_snapshot ?& array['observedAt','periodStart','periodEnd','counts']) or jsonb_typeof(p_snapshot->'counts')<>'object') then raise exception 'Invalid usage snapshot'; end if;
 insert into public.admin_project_usage(id,snapshot,attempted_at,status)
 values(true,p_snapshot,p_attempted_at,case when p_snapshot is null then 'error' else 'success' end)
 on conflict(id) do update set snapshot=coalesce(excluded.snapshot,admin_project_usage.snapshot),attempted_at=excluded.attempted_at,status=excluded.status
 where excluded.attempted_at>admin_project_usage.attempted_at;
end $$;

create or replace function public.admin_read_project_usage()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('snapshot',snapshot,'lastAttemptAt',attempted_at,'status',status) from public.admin_project_usage where id),' {"snapshot":null,"lastAttemptAt":null,"status":"unavailable"}'::jsonb);
$$;
revoke all on function public.admin_record_project_usage(jsonb,timestamptz),public.admin_read_project_usage() from public,anon,authenticated;
grant execute on function public.admin_record_project_usage(jsonb,timestamptz),public.admin_read_project_usage() to service_role;

create or replace function public.admin_schedule_usage_collection()
returns bigint language plpgsql security definer set search_path='' as $$
declare project_url text; token text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='kickon_monitoring_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='kickon_monitoring_cron_secret';
 if project_url is null or token is null then raise exception 'Usage collector is not configured'; end if;
 return net.http_post(url:=project_url||'/functions/v1/collect-admin-usage',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=30000);
end $$;
revoke all on function public.admin_schedule_usage_collection() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';

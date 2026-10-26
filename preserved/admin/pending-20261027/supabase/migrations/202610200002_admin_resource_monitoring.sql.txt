-- Resource-only history, isolated in each project. Application accounts and content are untouched.
create table if not exists public.admin_resource_samples (
 minute timestamptz primary key,
 observed_at timestamptz not null,
 sample jsonb not null check (jsonb_typeof(sample) = 'object'),
 counters jsonb not null check (jsonb_typeof(counters) = 'object'),
 check (minute = date_trunc('minute', observed_at))
);
alter table public.admin_resource_samples enable row level security;
revoke all on public.admin_resource_samples from public, anon, authenticated;
grant select, insert, update, delete on public.admin_resource_samples to service_role;

create or replace function public.admin_record_resource_sample(p_sample jsonb, p_counters jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare at timestamptz := (p_sample->>'observedAt')::timestamptz;
begin
 if at is null or abs(extract(epoch from clock_timestamp()-at)) > 120
  or coalesce(p_sample->>'status','') not in ('healthy','warning','critical','unknown','unreachable')
  or not (p_sample ?& array['status','cpu','memory','disk','connections','databaseBytes','bootAt'])
  or jsonb_typeof(p_counters) <> 'object' then raise exception 'Invalid monitoring sample'; end if;
 insert into public.admin_resource_samples(minute,observed_at,sample,counters)
 values(date_trunc('minute',at),at,p_sample,p_counters)
 on conflict(minute) do update set observed_at=excluded.observed_at,sample=excluded.sample,counters=excluded.counters
 where excluded.observed_at>admin_resource_samples.observed_at;
 delete from public.admin_resource_samples where observed_at < clock_timestamp()-interval '8 days';
 -- CPU counters are needed only for the five-minute baseline.
 update public.admin_resource_samples set counters='{}'::jsonb
 where minute < date_trunc('minute',clock_timestamp()-interval '6 minutes') and counters <> '{}'::jsonb;
end $$;

create or replace function public.admin_resource_collection_context()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('sample',sample,'counters',counters) order by observed_at),'[]'::jsonb)
 from public.admin_resource_samples where observed_at >= now()-interval '6 minutes';
$$;

create or replace function public.admin_read_resource_history(p_minutes integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
 if p_minutes not in (60,360,1440,10080) then raise exception 'Invalid monitoring range'; end if;
 return jsonb_build_object(
  'history',(select coalesce(jsonb_agg(sample order by observed_at),'[]'::jsonb) from public.admin_resource_samples where observed_at >= now()-make_interval(mins=>p_minutes+60)),
  'collectedSince',(select min(observed_at) from public.admin_resource_samples),
  'lastSuccessAt',(select max(observed_at) from public.admin_resource_samples where sample->>'status'<>'unreachable')
 );
end $$;

revoke all on function public.admin_record_resource_sample(jsonb,jsonb), public.admin_resource_collection_context(), public.admin_read_resource_history(integer) from public, anon, authenticated;
grant execute on function public.admin_record_resource_sample(jsonb,jsonb), public.admin_resource_collection_context(), public.admin_read_resource_history(integer) to service_role;

-- The deployment step sets these Vault secrets and enables the job only after the function is healthy.
create or replace function public.admin_schedule_resource_collection()
returns bigint language plpgsql security definer set search_path = '' as $$
declare project_url text; token text;
begin
 select decrypted_secret into project_url from vault.decrypted_secrets where name='kickon_monitoring_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='kickon_monitoring_cron_secret';
 if project_url is null or token is null then raise exception 'Monitoring is not configured'; end if;
 delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname='kickon-admin-resource-monitoring') and end_time < now()-interval '8 days';
 return net.http_post(url:=project_url||'/functions/v1/collect-admin-resources',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=30000);
end $$;
revoke all on function public.admin_schedule_resource_collection() from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';

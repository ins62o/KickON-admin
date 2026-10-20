-- Request counts were not the requested organization billing metrics.
select cron.unschedule(jobid) from cron.job where jobname='kickon-admin-project-usage';
drop function if exists public.admin_schedule_usage_collection();
revoke all on function public.admin_record_project_usage(jsonb,timestamptz),public.admin_read_project_usage() from service_role;
notify pgrst,'reload schema';

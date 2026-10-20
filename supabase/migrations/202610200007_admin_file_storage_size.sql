-- Only aggregate file sizes leave the Storage schema; no object names or metadata are exposed.
create or replace function public.admin_file_storage_size()
returns jsonb language sql stable security definer set search_path='' set statement_timeout='5s' as $$
 with sizes as (
  select case when jsonb_typeof(metadata->'size') in ('number','string')
   and (metadata->>'size') ~ '^(0|[1-9][0-9]*)$'
   then (metadata->>'size')::numeric end as bytes
  from storage.objects
 ), totals as (
  select coalesce(sum(bytes),0) as bytes,count(*) filter(where bytes is null) as missing from sizes
 )
 select jsonb_build_object('bytes',case when missing=0 and bytes<=9007199254740991 then bytes else null end) from totals;
$$;
revoke all on function public.admin_file_storage_size() from public,anon,authenticated;
grant execute on function public.admin_file_storage_size() to service_role;
notify pgrst,'reload schema';

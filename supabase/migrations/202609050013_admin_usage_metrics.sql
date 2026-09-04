-- Provide exact database and Storage usage through aggregate-only RPCs. This
-- migration follows the capability model introduced by 202609050008 and is
-- safe to apply whether the former, prematurely ordered usage migration was
-- applied to a project or not.

begin;

-- PostgreSQL cannot add OUT columns with CREATE OR REPLACE FUNCTION. Drop the
-- no-argument function inside this transaction so installations that already
-- applied the legacy five-column version can move to the extended contract.
drop function if exists public.admin_get_usage_snapshot();

create or replace function public.admin_get_usage_snapshot()
returns table (
  database_size_bytes bigint,
  storage_used_bytes bigint,
  storage_bucket_count bigint,
  storage_object_count bigint,
  storage_unmeasured_object_count bigint,
  storage_current_month_object_count bigint,
  storage_current_month_used_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz := (
    date_trunc('month', timezone('Asia/Seoul', now()))
      at time zone 'Asia/Seoul'
  );
  v_month_end timestamptz := (
    (date_trunc('month', timezone('Asia/Seoul', now())) + interval '1 month')
      at time zone 'Asia/Seoul'
  );
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('system.read')
    )
  then
    raise exception 'SYSTEM_READER_REQUIRED';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint as database_size_bytes,
    coalesce(sum(
      case
        when coalesce(stored_object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (stored_object.metadata ->> 'size')::numeric
        else 0::numeric
      end
    ), 0::numeric)::bigint as storage_used_bytes,
    count(distinct bucket.id)::bigint as storage_bucket_count,
    count(stored_object.id)::bigint as storage_object_count,
    count(stored_object.id) filter (
      where stored_object.id is not null
        and coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    )::bigint as storage_unmeasured_object_count,
    count(stored_object.id) filter (
      where stored_object.created_at >= v_month_start
        and stored_object.created_at < v_month_end
    )::bigint as storage_current_month_object_count,
    coalesce(sum(
      case
        when stored_object.created_at >= v_month_start
          and stored_object.created_at < v_month_end
          and coalesce(stored_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (stored_object.metadata ->> 'size')::numeric
        else 0::numeric
      end
    ), 0::numeric)::bigint as storage_current_month_used_bytes
  from storage.buckets bucket
  left join storage.objects stored_object
    on stored_object.bucket_id = bucket.id;
end;
$$;

revoke all on function public.admin_get_usage_snapshot()
  from public, anon;
grant execute on function public.admin_get_usage_snapshot()
  to authenticated, service_role;

comment on function public.admin_get_usage_snapshot() is
  'Returns exact project database size and aggregate Storage usage, including Asia/Seoul current-month totals, without exposing object paths.';

-- Preserve the existing per-bucket result shape while bringing its access
-- check in line with the system usage screen and service-role callers.
create or replace function public.admin_get_storage_usage()
returns table (
  bucket_id text,
  object_count bigint,
  used_bytes numeric,
  unmeasured_object_count bigint,
  oldest_object_at timestamptz,
  newest_object_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('system.read')
    )
  then
    raise exception 'SYSTEM_READER_REQUIRED';
  end if;

  return query
  select
    bucket.id::text,
    count(stored_object.id)::bigint,
    coalesce(sum(
      case
        when coalesce(stored_object.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (stored_object.metadata ->> 'size')::numeric
        else 0::numeric
      end
    ), 0::numeric) as used_bytes,
    count(stored_object.id) filter (
      where stored_object.id is not null
        and coalesce(stored_object.metadata ->> 'size', '') !~ '^[0-9]+$'
    )::bigint as unmeasured_object_count,
    min(stored_object.created_at) as oldest_object_at,
    max(stored_object.created_at) as newest_object_at
  from storage.buckets bucket
  left join storage.objects stored_object
    on stored_object.bucket_id = bucket.id
  group by bucket.id
  order by bucket.id;
end;
$$;

revoke all on function public.admin_get_storage_usage()
  from public, anon;
grant execute on function public.admin_get_storage_usage()
  to authenticated, service_role;

comment on function public.admin_get_storage_usage() is
  'Returns exact per-bucket object counts and metadata.size bytes without exposing object paths.';

commit;

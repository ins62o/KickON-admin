-- Restore the missing app activity contract using the verified production definitions.
-- Existing recording functions are preserved so later reward integrations are not replaced.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.app_daily_activity (
  activity_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text check (platform in ('ios', 'android')),
  first_seen_at timestamptz not null default now(),
  primary key (activity_date, user_id)
);
create index if not exists app_daily_activity_user_date_idx
  on public.app_daily_activity(user_id, activity_date desc);
alter table public.app_daily_activity enable row level security;
revoke all on public.app_daily_activity from public, anon, authenticated;
grant all on public.app_daily_activity to service_role;
comment on table public.app_daily_activity is
  'Daily app-open ledger for completed members, keyed by Korea-time date. Source for admin DAU/MAU.';

-- Only install the recording endpoint when it is missing.
do $migration$
begin
  if to_regprocedure('public.record_app_activity(text)') is null then
    execute $definition$
CREATE OR REPLACE FUNCTION public.record_app_activity(target_platform text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.app_daily_activity (activity_date, user_id, platform)
  select
    (now() at time zone 'Asia/Seoul')::date,
    profile.id,
    case when target_platform in ('ios', 'android') then target_platform end
  from public.profiles profile
  where profile.id = v_user_id
    and profile.registration_completed_at is not null
  on conflict (activity_date, user_id) do nothing;

  -- A new activity day can meet an existing level threshold; rewards stay idempotent.
  perform public.award_fan_level_points(v_user_id)
  where exists (
    select 1 from public.profiles profile
    where profile.id = v_user_id and profile.registration_completed_at is not null
  );
end;
$function$;
$definition$;
  end if;
end;
$migration$;
revoke all on function public.record_app_activity(text) from public, anon;
grant execute on function public.record_app_activity(text) to authenticated, service_role;
comment on function public.record_app_activity(text) is
  'Marks the signed-in completed member as active for the current Korea-time day. Idempotent per day.';

CREATE OR REPLACE FUNCTION public.admin_get_active_user_trend()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'Asia/Seoul')::date;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      (select auth.uid()) is null
      or not public.admin_has_capability('dashboard.read')
    )
  then
    raise exception 'DASHBOARD_PERMISSION_REQUIRED';
  end if;

  return (
    with member_days as (
      -- 180 charted days plus the 29 earlier days the first rolling MAU needs.
      select activity.activity_date, activity.user_id
      from public.app_daily_activity activity
      where activity.activity_date > v_today - 209
        and not exists (
          select 1
          from public.admin_users administrator
          where administrator.user_id = activity.user_id
        )
        and not exists (
          select 1
          from auth.identities identity
          where identity.user_id = activity.user_id
            and lower(identity.provider) = 'email'
        )
    ),
    daily as (
      select
        series.day,
        count(distinct member_day.user_id) filter (where member_day.activity_date = series.day) as dau,
        count(distinct member_day.user_id) as mau
      from (
        select generated.day_at::date as day
        from generate_series(v_today - 179, v_today, interval '1 day') as generated(day_at)
      ) series
      left join member_days member_day
        on member_day.activity_date > series.day - 30
        and member_day.activity_date <= series.day
      group by series.day
    )
    select jsonb_build_object(
      'generatedAt', v_now,
      'today', v_today,
      'trackingStartedOn', (select min(activity.activity_date) from public.app_daily_activity activity),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', daily.day,
          'dau', daily.dau,
          'mau', daily.mau
        ) order by daily.day)
        from daily
      ), '[]'::jsonb)
    )
  );
end;
$function$;
revoke all on function public.admin_get_active_user_trend() from public, anon;
grant execute on function public.admin_get_active_user_trend() to authenticated, service_role;
comment on function public.admin_get_active_user_trend() is
  'Returns 180 days of Korea-time DAU and rolling 30-day MAU, excluding administrators and service accounts.';

notify pgrst, 'reload schema';
commit;

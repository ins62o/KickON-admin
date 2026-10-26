-- Trigger functions run through their owning triggers and must not be callable
-- through PostgREST. Keep their search path deterministic and remove the
-- default PUBLIC execute grant.
alter function public.apply_football_player_localization()
  set search_path = '';

revoke all on function public.apply_football_player_localization()
  from public, anon, authenticated;
revoke all on function public.record_admin_audit_log()
  from public, anon, authenticated;
revoke all on function public.record_report_status_change()
  from public, anon, authenticated;

-- Use an explicitly typed empty array so plpgsql_check does not treat the
-- initializer as text while validating the function contract.
create or replace function public.recalculate_fan_activity_day(
  target_user_id uuid,
  target_activity_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.fan_activity_events;
  daily_total integer := 0;
  type_total integer := 0;
  type_cap integer := 0;
  next_award integer := 0;
  credited_likers uuid[] := array[]::uuid[];
begin
  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_activity_date::text, 0)
  );

  update public.fan_activity_events
  set awarded_points = 0
  where user_id = target_user_id and activity_date = target_activity_date;

  for event_row in
    select * from public.fan_activity_events
    where user_id = target_user_id
      and activity_date = target_activity_date
      and is_valid
      and base_points > 0
    order by occurred_at, id
  loop
    type_cap := case event_row.activity_type
      when 'POST_READ' then 1
      when 'POST_CREATE' then 3
      when 'COMMENT_CREATE' then 6
      when 'POST_LIKE_RECEIVED' then 5
      else 0
    end;

    if event_row.activity_type = 'POST_LIKE_RECEIVED'
       and event_row.actor_user_id = any(credited_likers) then
      next_award := 0;
    else
      select coalesce(sum(awarded_points), 0)::integer into type_total
      from public.fan_activity_events
      where user_id = target_user_id
        and activity_date = target_activity_date
        and activity_type = event_row.activity_type;
      next_award := greatest(
        0,
        least(event_row.base_points, type_cap - type_total, 15 - daily_total)
      );
    end if;

    update public.fan_activity_events
    set awarded_points = next_award
    where id = event_row.id;
    daily_total := daily_total + next_award;
    if event_row.activity_type = 'POST_LIKE_RECEIVED'
       and next_award > 0 then
      credited_likers := array_append(credited_likers, event_row.actor_user_id);
    end if;
  end loop;
end;
$$;

revoke all on function public.recalculate_fan_activity_day(uuid, date)
  from public, anon, authenticated;

comment on function public.recalculate_fan_activity_day(uuid, date) is
  'Recalculates a server-owned fan activity day with explicitly typed state.';

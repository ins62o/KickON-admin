-- Current ON users, today's accepted/failed notifications, and the current waiting queue.
begin;
create or replace function public.get_admin_push_overview()
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'') <> 'service_role' and not public.is_admin('viewer'::public.admin_role) then
  raise exception 'ADMIN_REQUIRED';
 end if;
 with bounds as (
  select date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as starts_at,
   (date_trunc('day',now() at time zone 'Asia/Seoul') + interval '1 day') at time zone 'Asia/Seoul' as ends_at
 ), members as materialized (
  select p.id,pref.match_notifications_enabled,pref.goal_notifications_enabled,pref.lineup_notifications_enabled,pref.community_notifications_enabled,
   (pref.match_notifications_enabled or pref.goal_notifications_enabled or pref.lineup_notifications_enabled or pref.community_notifications_enabled) as enabled
  from public.profiles p
  left join public.notification_preferences pref on pref.user_id=p.id
  where p.registration_completed_at is not null
   and not exists(select 1 from public.admin_users a where a.user_id=p.id)
   and (select lower(i.provider) from auth.identities i where i.user_id=p.id
    order by case lower(i.provider) when 'kakao' then 1 when 'apple' then 2 else 3 end,i.created_at asc limit 1) is distinct from 'email'
 ), counts as (
  select count(*) as total_users,count(*) filter(where enabled is true) as enabled_users,
   count(*) filter(where enabled is false) as disabled_users,count(*) filter(where enabled is null) as unknown_users from members
 ), records as materialized (
  select o.id,o.status,o.completed_at,
   case when n.type='MATCH' and n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then m.goal_notifications_enabled
    when n.type in ('MATCH','ATTENDANCE') then m.match_notifications_enabled
    when n.type='LINEUP' then m.lineup_notifications_enabled when n.type='COMMUNITY' then m.community_notifications_enabled
    when n.type='SYSTEM' then m.enabled
    when n.id is null then case
     when split_part(o.effect_key,':',1) in ('fixture-live','fixture-halftime','fixture-second-half','fixture-finished','attendance-reminder') then m.match_notifications_enabled
     when split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then m.goal_notifications_enabled
     when split_part(o.effect_key,':',1)='fixture-lineup' then m.lineup_notifications_enabled
     when split_part(o.effect_key,':',1) in ('comment','comment-reply','post-like') then m.community_notifications_enabled
    end end as enabled
  from public.push_outbox o join members m on m.id=o.user_id
  left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
 ), deliveries as (
  select r.*,t.*,b.starts_at,b.ends_at,
   (t.accepted_today or exists(select 1 from public.push_delivery_attempts a where a.outbox_id=r.id and a.status='SUCCEEDED' and a.completed_at>=b.starts_at and a.completed_at<b.ends_at)) as succeeded_today
  from records r cross join bounds b
  cross join lateral(select count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   coalesce(bool_or(status='SUCCEEDED' and completed_at>=b.starts_at and completed_at<b.ends_at),false) as accepted_today
   from public.push_delivery_targets where outbox_id=r.id) t
  where r.enabled is true
 ), delivery_counts as (
  select count(*) filter(where succeeded_today) as today_succeeded,
   count(*) filter(where completed_at>=starts_at and completed_at<ends_at and succeeded=0 and unknown=0 and status<>'UNKNOWN_OUTCOME'
    and (status='DEAD_LETTER' or status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY') and pending=0 and failed>0)) as today_failed,
   count(*) filter(where succeeded=0 and unknown=0 and status not in ('UNKNOWN_OUTCOME','DEAD_LETTER','SUPPRESSED','DISMISSED','SHADOWED')
    and (status in ('PENDING','PROCESSING','RETRY') or pending>0)) as pending_count
  from deliveries
 )
 select jsonb_build_object('checked_at',now(),'day_start',b.starts_at,'day_end',b.ends_at,
  'total_users',c.total_users,'enabled_users',c.enabled_users,'disabled_users',c.disabled_users,'unknown_users',c.unknown_users,
  'today_succeeded',d.today_succeeded,'today_failed',d.today_failed,'pending',d.pending_count) into result from counts c cross join bounds b cross join delivery_counts d;
 return result;
end;
$$;
revoke all on function public.get_admin_push_overview() from public,anon,authenticated;
grant execute on function public.get_admin_push_overview() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

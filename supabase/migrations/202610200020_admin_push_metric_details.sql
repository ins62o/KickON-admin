begin;
-- Shared, owner-only read sources keep card counts and their lists on the same scope.
create or replace function public.admin_push_members()
returns table(user_id uuid,nickname text,team jsonb,match_enabled boolean,goal_enabled boolean,lineup_enabled boolean,community_enabled boolean,enabled boolean)
language sql stable security definer set search_path='' as $$
 select p.id,p.nickname::text,case when t.id is not null then jsonb_build_object('id',t.id,'name',t.name,'code',t.code) end,
  pref.match_notifications_enabled,pref.goal_notifications_enabled,pref.lineup_notifications_enabled,pref.community_notifications_enabled,
  pref.match_notifications_enabled or pref.goal_notifications_enabled or pref.lineup_notifications_enabled or pref.community_notifications_enabled
 from public.profiles p left join public.notification_preferences pref on pref.user_id=p.id
 left join public.teams t on t.id=p.team_id
 where p.registration_completed_at is not null and not exists(select 1 from public.admin_users a where a.user_id=p.id)
  and (select lower(i.provider) from auth.identities i where i.user_id=p.id order by case lower(i.provider) when 'kakao' then 1 when 'apple' then 2 else 3 end,i.created_at asc limit 1) is distinct from 'email';
$$;
revoke all on function public.admin_push_members() from public,anon,authenticated,service_role;

create or replace function public.admin_push_delivery_records()
returns table(id uuid,user_id uuid,nickname text,team jsonb,phase text,title text,body text,kind text,created_at timestamptz,status text,last_error_code text,last_attempted_at timestamptz,attempts bigint,targets bigint,succeeded bigint,failed bigint,pending bigint,unknown bigint,shadowed bigint,suppressed bigint,completed_at timestamptz,success_at timestamptz,is_today_success boolean,is_today_failure boolean,is_pending boolean)
language sql stable security definer set search_path='' as $$
 with bounds as (
  select date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as starts_at,
   (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul' as ends_at
 ), context as (
  select o.*,m.nickname,m.team,n.title,n.body,
   case when n.type='MATCH' then n.data->>'phase' when n.id is null then case split_part(o.effect_key,':',1)
    when 'fixture-live' then 'KICKOFF' when 'fixture-halftime' then 'HALF_TIME' when 'fixture-second-half' then 'SECOND_HALF'
    when 'fixture-finished' then 'FULL_TIME' when 'fixture-goal' then 'GOAL' when 'fixture-goal-cancelled' then 'GOAL_CANCELLED' end end as phase,
   case when n.type='MATCH' then case when n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then 'goal' else 'match' end
    when n.type='LINEUP' then 'lineup' when n.type='COMMUNITY' then 'community' when n.type='ATTENDANCE' then 'attendance' when n.type='SYSTEM' then 'system'
    when n.id is null then case split_part(o.effect_key,':',1)
     when 'fixture-live' then 'match' when 'fixture-halftime' then 'match' when 'fixture-second-half' then 'match' when 'fixture-finished' then 'match'
     when 'fixture-goal' then 'goal' when 'fixture-goal-cancelled' then 'goal' when 'fixture-lineup' then 'lineup'
     when 'comment' then 'community' when 'comment-reply' then 'community' when 'post-like' then 'community' when 'attendance-reminder' then 'attendance' end end as kind,
   case when n.type='MATCH' and n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then m.goal_enabled
    when n.type in ('MATCH','ATTENDANCE') then m.match_enabled when n.type='LINEUP' then m.lineup_enabled
    when n.type='COMMUNITY' then m.community_enabled when n.type='SYSTEM' then m.enabled
    when n.id is null then case split_part(o.effect_key,':',1)
     when 'fixture-live' then m.match_enabled when 'fixture-halftime' then m.match_enabled when 'fixture-second-half' then m.match_enabled when 'fixture-finished' then m.match_enabled
     when 'fixture-goal' then m.goal_enabled when 'fixture-goal-cancelled' then m.goal_enabled when 'fixture-lineup' then m.lineup_enabled
     when 'comment' then m.community_enabled when 'comment-reply' then m.community_enabled when 'post-like' then m.community_enabled when 'attendance-reminder' then m.match_enabled end end as current_preference
  from public.push_outbox o join public.admin_push_members() m on m.user_id=o.user_id
  left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
 )
 select r.id,r.user_id,r.nickname,r.team,r.phase,r.title,r.body,r.kind,r.created_at,r.status,
  case when a.attempts=0 then r.last_error_code else a.last_error_code end,a.last_attempted_at,a.attempts,
  t.targets,t.succeeded,t.failed,t.pending,t.unknown,t.shadowed,t.suppressed,r.completed_at,greatest(t.success_at,a.success_at),
  (t.success_at is not null or a.success_at is not null),
  (r.completed_at>=b.starts_at and r.completed_at<b.ends_at and t.succeeded=0 and t.unknown=0 and r.status<>'UNKNOWN_OUTCOME'
   and (r.status='DEAD_LETTER' or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY') and t.pending=0 and t.failed>0)),
  (t.succeeded=0 and t.unknown=0 and r.status not in ('UNKNOWN_OUTCOME','DEAD_LETTER','SUPPRESSED','DISMISSED','SHADOWED') and (r.status in ('PENDING','PROCESSING','RETRY') or t.pending>0))
 from context r cross join bounds b
 cross join lateral(select count(*) as targets,count(*) filter(where d.status='SUCCEEDED') as succeeded,
  count(*) filter(where d.status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
  count(*) filter(where d.status in ('PENDING','PROCESSING','RETRY')) as pending,count(*) filter(where d.status='UNKNOWN_OUTCOME') as unknown,
  count(*) filter(where d.status='SHADOWED') as shadowed,count(*) filter(where d.status='SUPPRESSED') as suppressed,
  max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=b.starts_at and d.completed_at<b.ends_at) as success_at
  from public.push_delivery_targets d where d.outbox_id=r.id) t
 cross join lateral(select count(*) as attempts,max(d.attempted_at) as last_attempted_at,
  (array_agg(d.error_code order by d.attempted_at desc,d.id desc))[1] as last_error_code,
  max(d.completed_at) filter(where d.status='SUCCEEDED' and d.completed_at>=b.starts_at and d.completed_at<b.ends_at) as success_at
  from public.push_delivery_attempts d where d.outbox_id=r.id) a
 where r.current_preference is true;
$$;
revoke all on function public.admin_push_delivery_records() from public,anon,authenticated,service_role;

create or replace function public.get_admin_push_overview()
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 with members as (
  select count(*) as total_users,count(*) filter(where enabled is true) as enabled_users,
   count(*) filter(where enabled is false) as disabled_users,count(*) filter(where enabled is null) as unknown_users,
   count(*) filter(where lineup_enabled is true) as lineup_enabled_users,
   count(*) filter(where match_enabled is true and goal_enabled is true) as match_enabled_users,
   count(*) filter(where community_enabled is true) as community_enabled_users,
   count(*) filter(where match_enabled is not null and goal_enabled is not null and match_enabled<>goal_enabled) as match_partial_users
  from public.admin_push_members()
 ), deliveries as (
  select count(*) filter(where is_today_success) as today_succeeded,count(*) filter(where is_today_failure) as today_failed,count(*) filter(where is_pending) as pending from public.admin_push_delivery_records()
 )
 select jsonb_build_object('checked_at',now(),
  'day_start',date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul',
  'day_end',(date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul')||to_jsonb(m)||to_jsonb(d)
 into result from members m cross join deliveries d;
 return result;
end;
$$;
revoke all on function public.get_admin_push_overview() from public,anon,authenticated;
grant execute on function public.get_admin_push_overview() to authenticated,service_role;

create or replace function public.get_admin_push_enabled_users(p_query text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_query is null or char_length(p_query)>100 or p_page is null or p_page<1 or p_page>1000000 then raise exception 'INVALID_PUSH_USER_FILTER'; end if;
 with matching as materialized(select * from public.admin_push_members() where enabled is true
  and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(nickname,'')||' '||user_id::text))>0)),
 page_rows as(select * from matching order by lower(coalesce(nickname,'')),user_id limit 10 offset (p_page-1)*10)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by lower(coalesce(nickname,'')),user_id) from page_rows p),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_push_enabled_users(text,integer) from public,anon,authenticated;
grant execute on function public.get_admin_push_enabled_users(text,integer) to authenticated,service_role;

create or replace function public.get_admin_push_metric_recipients(p_metric text,p_query text,p_page integer)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_metric is null or p_metric not in ('success','failure','pending') or p_query is null or char_length(p_query)>100 or p_page is null or p_page<1 or p_page>1000000 then raise exception 'INVALID_PUSH_METRIC_FILTER'; end if;
 with matching as materialized(
  select r.*,case p_metric when 'success' then r.success_at when 'failure' then r.completed_at else coalesce(r.last_attempted_at,r.created_at) end as metric_at
  from public.admin_push_delivery_records() r
  where (case p_metric when 'success' then r.is_today_success when 'failure' then r.is_today_failure else r.is_pending end)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(nickname,'')||' '||user_id::text))>0)
 ), page_rows as(select * from matching order by metric_at desc nulls last,id desc limit 10 offset (p_page-1)*10)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(
  to_jsonb(p)-'is_today_success'-'is_today_failure'-'is_pending'-'success_at' order by metric_at desc nulls last,id desc) from page_rows p),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_push_metric_recipients(text,text,integer) from public,anon,authenticated;
grant execute on function public.get_admin_push_metric_recipients(text,text,integer) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

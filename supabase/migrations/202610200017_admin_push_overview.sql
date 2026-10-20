-- Current ON recipients only; unknown settings are not treated as enabled.
begin;
create or replace function public.get_admin_push_recipients(p_kind text,p_query text,p_page integer,p_result text,p_phase text)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'') <> 'service_role' and not public.is_admin('viewer'::public.admin_role) then
  raise exception 'ADMIN_REQUIRED';
 end if;
 if p_kind is null or p_kind not in ('match','goal','lineup','community','attendance','system')
  or p_phase is null or p_phase not in ('all','KICKOFF','HALF_TIME','SECOND_HALF','FULL_TIME')
  or p_kind<>'match' and p_phase<>'all'
  or p_result is null or p_result not in ('all','success','failure','excluded','no_target')
  or p_page is null or p_page<1 or p_page>1000000 or p_query is null or char_length(p_query)>100 then
  raise exception 'INVALID_PUSH_HISTORY_FILTER';
 end if;
 with records as (
  select o.id,o.user_id,p.nickname,case when team.id is not null then jsonb_build_object('id',team.id,'name',team.name,'code',team.code) end as team,n.title,n.body,o.created_at,o.status,o.last_error_code,
   case p_kind when 'match' then pref.match_notifications_enabled when 'attendance' then pref.match_notifications_enabled
    when 'goal' then pref.goal_notifications_enabled when 'lineup' then pref.lineup_notifications_enabled
    when 'community' then pref.community_notifications_enabled
    when 'system' then (pref.match_notifications_enabled or pref.goal_notifications_enabled or pref.lineup_notifications_enabled or pref.community_notifications_enabled) end as current_preference,
   case when n.type='MATCH' then n.data->>'phase' when n.id is null then case split_part(o.effect_key,':',1)
    when 'fixture-live' then 'KICKOFF' when 'fixture-halftime' then 'HALF_TIME'
    when 'fixture-second-half' then 'SECOND_HALF' when 'fixture-finished' then 'FULL_TIME' end end as phase,
   case when n.type='MATCH' then case when n.data->>'phase' in ('GOAL','GOAL_CANCELLED') then 'goal' else 'match' end
    when n.type='LINEUP' then 'lineup' when n.type='COMMUNITY' then 'community'
    when n.type='ATTENDANCE' then 'attendance' when n.type='SYSTEM' then 'system'
    when n.id is null then case
      when split_part(o.effect_key,':',1) in ('fixture-live','fixture-halftime','fixture-second-half','fixture-finished') then 'match'
      when split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then 'goal'
      when split_part(o.effect_key,':',1)='fixture-lineup' then 'lineup'
      when split_part(o.effect_key,':',1) in ('comment','comment-reply','post-like') then 'community'
      when split_part(o.effect_key,':',1)='attendance-reminder' then 'attendance'
    end end as kind
  from public.push_outbox o
  left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
  left join public.notification_preferences pref on pref.user_id=o.user_id
  left join public.profiles p on p.id=o.user_id
  left join public.teams team on team.id=p.team_id
 ), candidates as (
  select * from records where kind=p_kind and current_preference is true and (p_phase='all' or phase=p_phase)
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(nickname,'')||' '||user_id::text))>0)
 ), matching as materialized (
  select r.*,targets.*,history.attempt_count from candidates r
  cross join lateral (select count(*) as targets,
   count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status='SHADOWED') as shadowed,
   count(*) filter(where status='SUPPRESSED') as suppressed
   from public.push_delivery_targets where outbox_id=r.id) targets
  cross join lateral (select count(*) as attempt_count from public.push_delivery_attempts where outbox_id=r.id) history
  where p_result='all' or p_result='success' and targets.succeeded>0
   or p_result='failure' and targets.succeeded=0 and targets.unknown=0 and r.status<>'UNKNOWN_OUTCOME'
    and (r.status='DEAD_LETTER'
     or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY')
      and targets.pending=0 and targets.failed>0)
   or p_result='excluded' and targets.succeeded=0 and targets.unknown=0
    and r.status not in ('UNKNOWN_OUTCOME','DEAD_LETTER')
    and (r.status in ('SUPPRESSED','DISMISSED')
     or r.status not in ('SHADOWED','PENDING','PROCESSING','RETRY')
      and targets.pending=0 and targets.failed=0 and targets.shadowed=0 and targets.suppressed>0)
   or p_result='no_target' and r.status='COMPLETED' and targets.targets=0 and history.attempt_count=0
 ), page_rows as (
  select * from matching order by created_at desc,id desc limit 10 offset (p_page-1)*10
 )
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'user_id',r.user_id,'nickname',r.nickname,'team',r.team,'phase',r.phase,'title',r.title,'body',r.body,
   'created_at',r.created_at,'status',r.status,'last_error_code',case when latest.attempted_at is null then r.last_error_code else latest.error_code end,
   'last_attempted_at',latest.attempted_at,'attempts',r.attempt_count,
   'targets',r.targets,'succeeded',r.succeeded,'failed',r.failed,'pending',r.pending,
   'unknown',r.unknown,'shadowed',r.shadowed,'suppressed',r.suppressed
  ) order by r.created_at desc,r.id desc)
  from page_rows r
  left join lateral (select attempted_at,error_code from public.push_delivery_attempts where outbox_id=r.id order by attempted_at desc,id desc limit 1) latest on true
 ),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_push_recipients(text,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.get_admin_push_recipients(text,text,integer,text,text) to authenticated,service_role;
-- Aggregate counts only; no device credentials or user identifiers leave this RPC.
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
 ), today as (
  select o.id,o.status,
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
  cross join bounds b where o.completed_at>=b.starts_at and o.completed_at<b.ends_at
 ), failures as (
  select r.id from today r
  cross join lateral(select count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed
   from public.push_delivery_targets where outbox_id=r.id) t
  where r.enabled is true and t.succeeded=0 and t.unknown=0 and r.status<>'UNKNOWN_OUTCOME'
   and (r.status='DEAD_LETTER' or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY') and t.pending=0 and t.failed>0)
 )
 select jsonb_build_object('checked_at',now(),'day_start',b.starts_at,'day_end',b.ends_at,
  'total_users',c.total_users,'enabled_users',c.enabled_users,'disabled_users',c.disabled_users,'unknown_users',c.unknown_users,
  'today_failed',(select count(*) from failures)) into result from counts c cross join bounds b;
 return result;
end;
$$;
revoke all on function public.get_admin_push_overview() from public,anon,authenticated;
grant execute on function public.get_admin_push_overview() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

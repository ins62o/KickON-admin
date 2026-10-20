-- Separate recipients with no dispatch targets from actual failures.
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
  left join public.profiles p on p.id=o.user_id
  left join public.teams team on team.id=p.team_id
 ), candidates as (
  select * from records where kind=p_kind and (p_phase='all' or phase=p_phase)
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
create or replace function public.get_admin_push_delivery_detail(p_outbox_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'')<>'service_role' and not public.is_admin('viewer'::public.admin_role) then raise exception 'ADMIN_REQUIRED'; end if;
 if p_outbox_id is null then raise exception 'INVALID_PUSH_DELIVERY'; end if;
 select jsonb_build_object(
  'current_preference',case when context.type='MATCH' and context.phase in ('GOAL','GOAL_CANCELLED') then pref.goal_notifications_enabled
   when context.type in ('MATCH','ATTENDANCE') then pref.match_notifications_enabled
   when context.type='LINEUP' then pref.lineup_notifications_enabled when context.type='COMMUNITY' then pref.community_notifications_enabled end,
  'status',o.status,'created_at',o.created_at,'completed_at',o.completed_at,'last_error_code',o.last_error_code,
  'last_attempted_at',a.last_attempted_at,'last_success_at',coalesce(a.last_success_at,t.last_success_at),'attempts',a.attempts,
  'targets',t.targets,'succeeded',t.succeeded,'failed',t.failed,'pending',t.pending,'unknown',t.unknown,'shadowed',t.shadowed,'suppressed',t.suppressed,
  'reasons',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'count',r.count) order by r.count desc,r.code) from (
   select last_error_code as code,count(*) as count from public.push_delivery_targets
   where outbox_id=o.id and status<>'SUCCEEDED' and nullif(btrim(last_error_code),'') is not null group by last_error_code
  ) r),case when coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code) is not null then jsonb_build_array(jsonb_build_object('code',coalesce(nullif(btrim(o.last_error_code),''),a.last_error_code),'count',null)) else '[]'::jsonb end)
 ) into result
 from public.push_outbox o
 left join public.notifications n on n.id=o.notification_id and n.user_id=o.user_id
 left join public.notification_preferences pref on pref.user_id=o.user_id
 cross join lateral (select coalesce(n.type::text,case
  when split_part(o.effect_key,':',1) in ('fixture-live','fixture-halftime','fixture-second-half','fixture-finished','fixture-goal','fixture-goal-cancelled') then 'MATCH'
  when split_part(o.effect_key,':',1)='fixture-lineup' then 'LINEUP'
  when split_part(o.effect_key,':',1)='attendance-reminder' then 'ATTENDANCE'
  when split_part(o.effect_key,':',1) in ('comment','comment-reply','post-like') then 'COMMUNITY' end) as type,
  coalesce(n.data->>'phase',case when split_part(o.effect_key,':',1) in ('fixture-goal','fixture-goal-cancelled') then 'GOAL' end) as phase) context
 cross join lateral (select count(*) as targets,count(*) filter(where status='SUCCEEDED') as succeeded,
  count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
  count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
  count(*) filter(where status='SHADOWED') as shadowed,count(*) filter(where status='SUPPRESSED') as suppressed,
  max(completed_at) filter(where status='SUCCEEDED') as last_success_at
  from public.push_delivery_targets where outbox_id=o.id) t
 cross join lateral (select count(*) as attempts,max(attempted_at) as last_attempted_at,
  max(completed_at) filter(where status='SUCCEEDED') as last_success_at,
  (array_agg(error_code order by attempted_at desc,id desc) filter(where nullif(btrim(error_code),'') is not null))[1] as last_error_code
  from public.push_delivery_attempts where outbox_id=o.id) a
 where o.id=p_outbox_id;
 if result is null then raise exception 'PUSH_DELIVERY_NOT_FOUND'; end if;
 return result;
end;
$$;
revoke all on function public.get_admin_push_delivery_detail(uuid) from public,anon,authenticated;
grant execute on function public.get_admin_push_delivery_detail(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

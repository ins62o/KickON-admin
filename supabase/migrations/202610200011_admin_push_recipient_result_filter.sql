-- Filter the full result set before counting and paging; keep the three-argument RPC compatible.
begin;
create or replace function public.get_admin_push_recipients(p_kind text,p_query text,p_page integer,p_result text)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare result jsonb;
begin
 if coalesce((select auth.role()),'') <> 'service_role' and not public.is_admin('viewer'::public.admin_role) then
  raise exception 'ADMIN_REQUIRED';
 end if;
 if p_kind is null or p_kind not in ('match','goal','lineup','community','attendance','system')
  or p_result is null or p_result not in ('all','success','failure')
  or p_page is null or p_page<1 or p_page>1000000 or p_query is null or char_length(p_query)>100 then
  raise exception 'INVALID_PUSH_HISTORY_FILTER';
 end if;
 with records as (
  select o.id,o.user_id,p.nickname,case when team.id is not null then jsonb_build_object('id',team.id,'name',team.name,'code',team.code) end as team,n.title,n.body,o.created_at,o.status,o.last_error_code,
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
  select * from records where kind=p_kind
   and (btrim(p_query)='' or position(lower(btrim(p_query)) in lower(coalesce(nickname,'')||' '||user_id::text))>0)
 ), matching as materialized (
  select r.*,targets.* from candidates r
  cross join lateral (select count(*) as targets,
   count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status='SHADOWED') as shadowed,
   count(*) filter(where status='SUPPRESSED') as suppressed
   from public.push_delivery_targets where outbox_id=r.id) targets
  where p_result='all' or p_result='success' and targets.succeeded>0
   or p_result='failure' and targets.succeeded=0 and targets.unknown=0 and r.status<>'UNKNOWN_OUTCOME'
    and (r.status='DEAD_LETTER'
     or r.status not in ('SUPPRESSED','DISMISSED','SHADOWED','PENDING','PROCESSING','RETRY')
      and targets.pending=0 and (targets.failed>0 or r.status='COMPLETED' and targets.targets=0))
 ), page_rows as (
  select * from matching order by created_at desc,id desc limit 10 offset (p_page-1)*10
 )
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((
  select jsonb_agg(jsonb_build_object(
   'id',r.id,'user_id',r.user_id,'nickname',r.nickname,'team',r.team,'title',r.title,'body',r.body,
   'created_at',r.created_at,'status',r.status,'last_error_code',case when latest.attempted_at is null then r.last_error_code else latest.error_code end,
   'last_attempted_at',latest.attempted_at,'attempts',attempts.count,
   'targets',r.targets,'succeeded',r.succeeded,'failed',r.failed,'pending',r.pending,
   'unknown',r.unknown,'shadowed',r.shadowed,'suppressed',r.suppressed
  ) order by r.created_at desc,r.id desc)
  from page_rows r
  cross join lateral (select count(*) as count from public.push_delivery_attempts where outbox_id=r.id) attempts
  left join lateral (select attempted_at,error_code from public.push_delivery_attempts where outbox_id=r.id order by attempted_at desc,id desc limit 1) latest on true
 ),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_admin_push_recipients(text,text,integer,text) from public,anon,authenticated;
grant execute on function public.get_admin_push_recipients(text,text,integer,text) to authenticated,service_role;
-- Old clients still request the unfiltered list using the original argument names.
create or replace function public.get_admin_push_recipients(p_kind text,p_query text default '',p_page integer default 1)
returns jsonb language sql stable security definer set search_path='' set statement_timeout='5s' as $$
 select public.get_admin_push_recipients(p_kind,p_query,p_page,'all');
$$;
revoke all on function public.get_admin_push_recipients(text,text,integer) from public,anon,authenticated;
grant execute on function public.get_admin_push_recipients(text,text,integer) to authenticated,service_role;
notify pgrst,'reload schema';
commit;

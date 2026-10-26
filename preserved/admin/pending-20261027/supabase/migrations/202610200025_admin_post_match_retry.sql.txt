begin;
create or replace function public.admin_post_match_retry_scope()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
  'league_id',m.league_id,'generation',m.generation,'state',m.state,'last_error',m.last_error,
  'fixtures',(select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'sportmonks_id',f.sportmonks_id,'league_id',f.league_id,'status',f.status,
    'provider_status',f.provider_status,'home_team_id',f.home_team_id,'away_team_id',f.away_team_id,
    'home_provider_id',h.sportmonks_id,'away_provider_id',a.sportmonks_id,
    'post_match_synced_at',f.post_match_synced_at,'post_match_sync_due_at',f.post_match_sync_due_at
  ) order by f.id),'[]'::jsonb) from public.fixtures f
   join public.teams h on h.id=f.home_team_id join public.teams a on a.id=f.away_team_id
   where f.league_id=m.league_id and f.kickoff_at>='2026-01-01' and f.kickoff_at<'2027-01-01'
    and f.status='FINISHED' and f.post_match_sync_due_at<=now() and f.post_match_synced_at is null)
 ) order by m.league_id),'[]'::jsonb)
 from public.football_maintenance_runs_v1 m where m.kind='post_match' and m.season=2026 and m.state in('BLOCKED','ERROR'));
end $$;
revoke all on function public.admin_post_match_retry_scope() from public,anon,authenticated;
grant execute on function public.admin_post_match_retry_scope() to service_role;

create or replace function public.admin_request_post_match_retry(p_actor uuid,p_environment text,p_request_id uuid,p_league text,p_generation bigint,p_fixture_ids jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.football_maintenance_runs_v1%rowtype;r public.sync_runs%rowtype;ids jsonb;net_id bigint;before_image jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';end if;
 if p_actor is null or not exists(select 1 from public.admin_users where user_id=p_actor and is_active and role::text in('data_editor','operator','admin','super_admin')) then raise exception 'ADMIN_REQUIRED';end if;
 if p_environment is null or p_environment not in('production','development') or p_league is null or p_league not in('kleague','kleague2') or p_request_id is null or p_generation is null then raise exception 'INVALID_RETRY_SCOPE';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('football-maintenance:'||p_league||':2026',0));
 select * into r from public.sync_runs where id=p_request_id;
 if found then
  if r.requested_by is distinct from p_actor or r.environment<>p_environment or r.job_key<>'kickon-post-match-football-sync' or r.target_id<>p_league then raise exception 'RETRY_REQUEST_CONFLICT';end if;
  return jsonb_build_object('status','already_requested','run_id',r.id,'result',r.status);
 end if;
 select * into m from public.football_maintenance_runs_v1 where league_id=p_league and season=2026 and kind='post_match' for update;
 if not found or m.generation<>p_generation then raise exception 'RETRY_STATE_CHANGED';end if;
 if m.state not in('BLOCKED','ERROR') or m.owner is not null or m.lease_expires_at>clock_timestamp() or m.next_attempt_at>clock_timestamp() then raise exception 'RETRY_NOT_READY';end if;
 if m.last_error not in('CRON46_BLOCKED:PROVIDER_FINISHED_REQUIRED','CRON46_BLOCKED:FINISHED_ONLY') and not(m.state='ERROR' and m.last_error like 'CRON46_RETRY:%') or m.last_error is null then raise exception 'RETRY_REVIEW_REQUIRED';end if;
 if exists(select 1 from public.football_maintenance_runs_v1 where league_id=p_league and season=2026 and state='RUNNING' and lease_expires_at>clock_timestamp()) then raise exception 'RETRY_ALREADY_RUNNING';end if;
 perform 1 from public.fixtures where league_id=p_league and kickoff_at>='2026-01-01' and kickoff_at<'2027-01-01' and status='FINISHED' and post_match_sync_due_at<=now() and post_match_synced_at is null order by id for update;
 select jsonb_agg(id order by id) into ids from public.fixtures where league_id=p_league and kickoff_at>='2026-01-01' and kickoff_at<'2027-01-01' and status='FINISHED' and post_match_sync_due_at<=now() and post_match_synced_at is null;
 if ids is null or ids is distinct from p_fixture_ids then raise exception 'RETRY_FIXTURES_CHANGED';end if;
 if exists(select 1 from public.sync_runs where job_key='kickon-post-match-football-sync' and target_id=p_league and status in('queued','running') and created_at>now()-interval '2 minutes') then raise exception 'RETRY_ALREADY_QUEUED';end if;
 before_image:=to_jsonb(m);
 insert into public.sync_runs(id,job_key,target_type,target_id,trigger_type,environment,status,requested_by,reason,metadata)
 values(p_request_id,'kickon-post-match-football-sync','league',p_league,'retry',p_environment,'queued',p_actor,'원인 재확인 후 경기 후 데이터 갱신 재시도',jsonb_build_object('leagueId',p_league,'internal_season',2026,'previous_error',m.last_error,'previous_generation',m.generation,'verified_fixture_ids',ids));
 -- Keep the previous error until the existing worker claims and completes it.
 update public.football_maintenance_runs_v1 set state='ERROR',next_attempt_at=null where league_id=p_league and season=2026 and kind='post_match';
 select public.invoke_football_data_sync(jsonb_build_object('leagueId',p_league,'providerLeagueId',case p_league when 'kleague' then 1034 else 1362 end,'seasonId',case p_league when 'kleague' then 26894 else 27443 end,'season',2026,'postMatch',true,'syncLineups',false,'adminRetryRunId',p_request_id)) into net_id;
 if net_id is null then raise exception 'RETRY_ENQUEUE_FAILED';end if;
 update public.sync_runs set metadata=metadata||jsonb_build_object('queue_request_id',net_id) where id=p_request_id;
 insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,reason,before_value,after_value,request_id)
 values(p_actor,'request_post_match_retry','football_maintenance','2026:'||p_league,'공급자 종료 상태와 대상 경기 재확인 후 기존 보호 경로로 재시도',before_image,jsonb_build_object('run_id',p_request_id,'state','ERROR','queue_request_id',net_id),p_request_id::text);
 return jsonb_build_object('status','queued','run_id',p_request_id);
end $$;
revoke all on function public.admin_request_post_match_retry(uuid,text,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.admin_request_post_match_retry(uuid,text,uuid,text,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
commit;

begin;
set local lock_timeout='10s';
do $$ begin
 if not exists(select 1 from public.m02c_gate where singleton and mode='ACTIVE') then raise exception 'ACTIVE_REQUIRED';end if;
 if md5(pg_get_functiondef('public.apply_finished_fixture_result_v1(jsonb,uuid,bigint)'::regprocedure))<>'53144b2db8fbb5c966714c3231b3c03e' then raise exception 'SEALED_FUNCTION_DRIFT';end if;
 if md5(pg_get_functiondef('public.apply_football_maintenance_rows_v1(text,integer,uuid,bigint,jsonb)'::regprocedure))<>'f48b67189fc7b6f3d411123d7fe7bfe3' then raise exception 'SEALED_FUNCTION_DRIFT';end if;
 if md5(pg_get_functiondef('public.apply_historical_finished_fixture_v1(jsonb,uuid,bigint)'::regprocedure))<>'9f0197eae056ae4e39bb4bfdd02d4a4e' then raise exception 'SEALED_FUNCTION_DRIFT';end if;
 if md5(pg_get_functiondef('public.claim_football_maintenance_v1(text,text,integer,uuid)'::regprocedure))<>'a80a7badf863324004dd6e9bf15a98fe' then raise exception 'SEALED_FUNCTION_DRIFT';end if;
 if md5(pg_get_functiondef('public.complete_football_maintenance_v1(text,integer,uuid,bigint,text,text)'::regprocedure))<>'e0f3f097d21f87ac06df779c5c87cb93' then raise exception 'SEALED_FUNCTION_DRIFT';end if;
end $$;
do $$ declare m public.football_maintenance_runs_v1%rowtype;net_id bigint;ids jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('football-maintenance:kleague:2026',0));
 select * into m from public.football_maintenance_runs_v1 where league_id='kleague' and season=2026 and kind='post_match' for update;
 if not found or m.generation<>2 or m.state<>'BLOCKED' or m.last_error is distinct from 'CRON46_BLOCKED:PROVIDER_FINISHED_REQUIRED' or m.owner is not null or m.lease_expires_at is not null then raise exception 'RECOVERY_BEFORE_IMAGE_CHANGED';end if;
 if exists(select 1 from public.football_maintenance_runs_v1 where league_id='kleague' and season=2026 and state='RUNNING' and lease_expires_at>clock_timestamp()) then raise exception 'SCOPE_BUSY';end if;
 select jsonb_agg(id order by id) into ids from public.fixtures where league_id='kleague' and status='FINISHED' and post_match_synced_at is null and post_match_sync_due_at<=now() and kickoff_at>='2026-01-01' and kickoff_at<'2027-01-01';
 if ids is distinct from '["sportmonks-19648041", "sportmonks-19648042", "sportmonks-19648043", "sportmonks-19648044", "sportmonks-19648046"]'::jsonb then raise exception 'RECOVERY_TARGETS_CHANGED';end if;
 insert into public.sync_runs(id,job_key,target_type,target_id,trigger_type,environment,status,reason,metadata)
 values('eb701dbd-da91-48f4-804c-af06e4079018','kickon-post-match-football-sync','league','kleague','retry','production','queued','사용자 명시 요청: 차단 원인 수정 후 미처리 경기 운영 복구',jsonb_build_object('leagueId','kleague','internal_season',2026,'previous_error',m.last_error,'previous_generation',m.generation,'verified_fixture_ids',ids,'operator','authorized_maintenance'));
 update public.football_maintenance_runs_v1 set state='ERROR',next_attempt_at=null where league_id='kleague' and season=2026 and kind='post_match';
 select public.invoke_football_data_sync(jsonb_build_object('leagueId','kleague','providerLeagueId',1034,'seasonId',26894,'season',2026,'postMatch',true,'syncLineups',false,'adminRetryRunId','eb701dbd-da91-48f4-804c-af06e4079018')) into net_id;
 if net_id is null then raise exception 'ENQUEUE_FAILED';end if;
 update public.sync_runs set metadata=metadata||jsonb_build_object('queue_request_id',net_id) where id='eb701dbd-da91-48f4-804c-af06e4079018';
 insert into public.admin_audit_logs(action,entity_type,entity_id,reason,before_value,after_value,request_id)
 values('authorized_post_match_recovery','football_maintenance','2026:kleague','사용자 명시 요청: 검증 조건 유지 및 처리 범위 수정 후 운영 복구',to_jsonb(m),jsonb_build_object('run_id','eb701dbd-da91-48f4-804c-af06e4079018','queue_request_id',net_id,'state','ERROR'),'eb701dbd-da91-48f4-804c-af06e4079018');
end $$;
do $$ declare m public.football_maintenance_runs_v1%rowtype;net_id bigint;ids jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('football-maintenance:kleague2:2026',0));
 select * into m from public.football_maintenance_runs_v1 where league_id='kleague2' and season=2026 and kind='post_match' for update;
 if not found or m.generation<>7 or m.state<>'BLOCKED' or m.last_error is distinct from 'CRON46_BLOCKED:FINISHED_ONLY' or m.owner is not null or m.lease_expires_at is not null then raise exception 'RECOVERY_BEFORE_IMAGE_CHANGED';end if;
 if exists(select 1 from public.football_maintenance_runs_v1 where league_id='kleague2' and season=2026 and state='RUNNING' and lease_expires_at>clock_timestamp()) then raise exception 'SCOPE_BUSY';end if;
 select jsonb_agg(id order by id) into ids from public.fixtures where league_id='kleague2' and status='FINISHED' and post_match_synced_at is null and post_match_sync_due_at<=now() and kickoff_at>='2026-01-01' and kickoff_at<'2027-01-01';
 if ids is distinct from '["sportmonks-19676306", "sportmonks-19676307", "sportmonks-19676308"]'::jsonb then raise exception 'RECOVERY_TARGETS_CHANGED';end if;
 insert into public.sync_runs(id,job_key,target_type,target_id,trigger_type,environment,status,reason,metadata)
 values('8fb46c06-a099-4464-ad32-44a47671adec','kickon-post-match-football-sync','league','kleague2','retry','production','queued','사용자 명시 요청: 차단 원인 수정 후 미처리 경기 운영 복구',jsonb_build_object('leagueId','kleague2','internal_season',2026,'previous_error',m.last_error,'previous_generation',m.generation,'verified_fixture_ids',ids,'operator','authorized_maintenance'));
 update public.football_maintenance_runs_v1 set state='ERROR',next_attempt_at=null where league_id='kleague2' and season=2026 and kind='post_match';
 select public.invoke_football_data_sync(jsonb_build_object('leagueId','kleague2','providerLeagueId',1362,'seasonId',27443,'season',2026,'postMatch',true,'syncLineups',false,'adminRetryRunId','8fb46c06-a099-4464-ad32-44a47671adec')) into net_id;
 if net_id is null then raise exception 'ENQUEUE_FAILED';end if;
 update public.sync_runs set metadata=metadata||jsonb_build_object('queue_request_id',net_id) where id='8fb46c06-a099-4464-ad32-44a47671adec';
 insert into public.admin_audit_logs(action,entity_type,entity_id,reason,before_value,after_value,request_id)
 values('authorized_post_match_recovery','football_maintenance','2026:kleague2','사용자 명시 요청: 검증 조건 유지 및 처리 범위 수정 후 운영 복구',to_jsonb(m),jsonb_build_object('run_id','8fb46c06-a099-4464-ad32-44a47671adec','queue_request_id',net_id,'state','ERROR'),'8fb46c06-a099-4464-ad32-44a47671adec');
end $$;
commit;
select job_key,target_id,status,id from public.sync_runs where id in('eb701dbd-da91-48f4-804c-af06e4079018','8fb46c06-a099-4464-ad32-44a47671adec');

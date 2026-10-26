begin;

-- Persisted maintenance errors remain visible after the scheduler has skipped blocked work.
create or replace function public.get_admin_football_sync_health()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.is_admin('viewer'::public.admin_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  return jsonb_build_object(
    'checked_at', now(),
    'jobs', (select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) from public.get_admin_cron_jobs() j),
    'states', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (
      select sync_key, season, league_id, last_attempted_at, last_succeeded_at,
        case when nullif(btrim(last_error), '') is not null then 'SYNC_ERROR' end as last_error
      from public.football_sync_state
      where sync_key = 'sportmonks-live' or sync_key like 'sportmonks-post-match:%'
        or sync_key like 'sportmonks-history:%' or sync_key like 'team-squad:%'
        or sync_key like 'team-metrics:%'
    ) s),
    'maintenance', (select coalesce(jsonb_agg(jsonb_build_object(
      'league_id', m.league_id, 'season', m.season, 'kind', m.kind, 'state', m.state,
      'reason_code', case when m.last_error ~ '^CRON46_BLOCKED:[A-Z_]+$'
        then split_part(m.last_error, ':', 2) else null end
    ) order by m.league_id, m.season, m.kind), '[]'::jsonb)
      from public.football_maintenance_runs_v1 m where m.state in ('BLOCKED','ERROR')),
    'live', jsonb_build_object(
      'last_attempted_at', (select last_attempted_at from public.football_sync_state where sync_key = 'sportmonks-live'),
      'last_succeeded_at', (select last_succeeded_at from public.football_sync_state where sync_key = 'sportmonks-live'),
      'has_error', exists(select 1 from public.football_sync_state where sync_key = 'sportmonks-live' and nullif(btrim(last_error), '') is not null),
      'running', exists(select 1 from public.live_sync_leases where sync_key = 'sportmonks-live' and lease_owner is not null and lease_expires_at > now()),
      'leagues', (select jsonb_agg(jsonb_build_object(
        'league_id', league.id,
        'paused', case when global_control.scope is null or league_control.scope is null then null
          else global_control.paused or league_control.paused end,
        'lineup_targets', targets.lineup_targets,
        'live_targets', targets.live_targets,
        'postponed_targets', targets.postponed_targets,
        'due_since', targets.due_since,
        'lineup_poll_at', lineup_poll.observed_at,
        'lineup_http_status', lineup_poll.status_code,
        'live_poll_at', live_poll.observed_at,
        'live_http_status', live_poll.status_code
      ) order by league.id)
      from (values ('kleague'), ('kleague2')) league(id)
      left join public.provider_fetch_controls global_control on global_control.scope = 'GLOBAL'
      left join public.provider_fetch_controls league_control on league_control.scope = league.id
      cross join lateral (
        select count(*) filter(where f.status in ('SCHEDULED','LIVE') and f.kickoff_at > now()
            and f.kickoff_at <= now() + interval '2 hours') as lineup_targets,
          count(*) filter(where f.status = 'LIVE' or f.kickoff_at between now() - interval '2 hours' and now() + interval '15 minutes') as live_targets,
          count(*) filter(where f.provider_status = 'POSTPONED') as postponed_targets,
          min(case when f.status = 'LIVE' then least(f.kickoff_at, now())
            when f.provider_status = 'POSTPONED' then f.kickoff_at
            when f.status = 'SCHEDULED' and f.kickoff_at > now() and f.kickoff_at <= now() + interval '2 hours'
              then f.kickoff_at - interval '2 hours'
            when f.kickoff_at between now() - interval '2 hours' and now() + interval '15 minutes'
              then f.kickoff_at - interval '15 minutes' end) as due_since
        from public.fixtures f where f.league_id = league.id and f.sportmonks_id is not null
      ) targets
      left join lateral (
        select u.observed_at, u.status_code from public.football_provider_usage u
        where u.observed_at between now() - interval '10 minutes' and now()
          and u.source = 'live-lineups' and u.league_ids @> array[league.id]
        order by u.observed_at desc, u.id desc limit 1
      ) lineup_poll on true
      left join lateral (
        select u.observed_at, u.status_code from public.football_provider_usage u
        where u.observed_at between now() - interval '10 minutes' and now()
          and u.source in ('live-snapshot', 'live-poll', 'live-inplay', 'live-fallback')
          and u.league_ids @> array[league.id]
        order by u.observed_at desc, u.id desc limit 1
      ) live_poll on true)
    )
  );
end;
$$;
revoke all on function public.get_admin_football_sync_health() from public, anon, authenticated;
grant execute on function public.get_admin_football_sync_health() to authenticated, service_role;
notify pgrst, 'reload schema';

commit;

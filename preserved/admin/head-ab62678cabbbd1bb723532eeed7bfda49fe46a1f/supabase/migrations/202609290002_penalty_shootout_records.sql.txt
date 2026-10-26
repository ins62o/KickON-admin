begin;

create table if not exists public.penalty_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  shots jsonb not null default '[]'::jsonb check (jsonb_typeof(shots)='array'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  check (score <= jsonb_array_length(shots))
);
create unique index if not exists penalty_runs_one_active_user
  on public.penalty_runs(user_id) where completed_at is null;
create index if not exists penalty_runs_history
  on public.penalty_runs(user_id, completed_at desc) where completed_at is not null;
alter table public.penalty_runs enable row level security;
revoke all on public.penalty_runs from public, anon, authenticated;
grant all on public.penalty_runs to service_role;

create or replace function public.start_penalty_run()
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_id uuid := auth.uid(); run public.penalty_runs;
begin
  if member_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.profiles p where p.id=member_id
    and p.registration_completed_at is not null) then raise exception 'MEMBER_REQUIRED'; end if;
  -- Serializes two devices/open requests belonging to the same member.
  perform pg_advisory_xact_lock(hashtextextended('penalty:' || member_id::text, 0));
  select * into run from public.penalty_runs r
    where r.user_id=member_id and r.completed_at is null;
  if run.id is null then
    insert into public.penalty_runs(user_id) values (member_id) returning * into run;
  end if;
  return jsonb_build_object('id',run.id,'score',run.score,'shots',run.shots,'completedAt',run.completed_at);
end $$;

create or replace function public.take_penalty_shot(target_run_id uuid, shot_index integer, shot_direction text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_id uuid := auth.uid(); run public.penalty_runs; keeper text; result text;
begin
  if member_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if shot_direction is null or shot_direction not in ('LEFT','CENTER','RIGHT') then
    raise exception 'INVALID_DIRECTION'; end if;
  select * into run from public.penalty_runs r where r.id=target_run_id
    and r.user_id=member_id for update;
  if run.id is null then raise exception 'RUN_NOT_FOUND'; end if;
  if shot_index is null or shot_index < 1 then raise exception 'INVALID_SHOT_SEQUENCE'; end if;
  -- Replaying a committed request never rerolls the keeper or adds another goal.
  if shot_index <= jsonb_array_length(run.shots) then
    return jsonb_build_object('id',run.id,'score',run.score,'shots',run.shots,'completedAt',run.completed_at);
  end if;
  if run.completed_at is not null then raise exception 'RUN_COMPLETE'; end if;
  if shot_index <> jsonb_array_length(run.shots)+1 then raise exception 'INVALID_SHOT_SEQUENCE'; end if;
  keeper := (array['LEFT','CENTER','RIGHT'])[floor(random()*3)::integer+1];
  result := case when keeper=shot_direction then 'SAVED' else 'GOAL' end;
  update public.penalty_runs r set
    score=r.score+case when result='GOAL' then 1 else 0 end,
    shots=r.shots || jsonb_build_array(jsonb_build_object('direction',shot_direction,'keeper',keeper,'result',result)),
    completed_at=case when result='SAVED' then now() end
  where r.id=run.id returning * into run;
  return jsonb_build_object('id',run.id,'score',run.score,'shots',run.shots,'completedAt',run.completed_at);
end $$;

create or replace function public.get_penalty_records()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member_id uuid := auth.uid(); response jsonb;
begin
  if member_id is null then raise exception 'AUTH_REQUIRED'; end if;
  with stats as (
    select r.user_id, max(r.score) as best, sum(r.score) as total, count(*) as plays,
      min(r.completed_at) as first_record_at
    from public.penalty_runs r where r.completed_at is not null group by r.user_id
  ), ranked as (
    select p.id, p.nickname, s.best, s.total, s.plays,
      rank() over (order by s.best desc) as place,
      row_number() over (order by s.best desc, s.first_record_at, p.id) as ordinal
    from stats s join public.profiles p on p.id=s.user_id
    where p.registration_completed_at is not null and p.nickname <> '' and not p.is_test_account
  ), own as (
    select member_id as id, coalesce(p.nickname,'') as nickname, r.place,
      coalesce(s.best,0) as best, coalesce(s.total,0) as total, coalesce(s.plays,0) as plays
    from (select member_id as id) member
    left join public.profiles p on p.id=member.id
    left join stats s on s.user_id=member.id left join ranked r on r.id=member.id
  )
  select jsonb_build_object(
    'leaderboard',coalesce((select jsonb_agg(jsonb_build_object(
      'userId',r.id,'nickname',r.nickname,'rank',r.place,'bestScore',r.best,'totalGoals',r.total,'plays',r.plays)
      order by r.ordinal) from ranked r where r.ordinal <= 50),'[]'::jsonb),
    'mine',(select jsonb_build_object('userId',o.id,'nickname',o.nickname,'rank',o.place,
      'bestScore',o.best,'totalGoals',o.total,'plays',o.plays) from own o),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
      'id',h.id,'score',h.score,'completedAt',h.completed_at) order by h.completed_at desc, h.id)
      from (select r.id,r.score,r.completed_at from public.penalty_runs r
        where r.user_id=member_id and r.completed_at is not null
        order by r.completed_at desc,r.id limit 20) h),'[]'::jsonb)
  ) into response;
  return response;
end $$;

revoke all on function public.start_penalty_run() from public, anon;
revoke all on function public.take_penalty_shot(uuid,integer,text) from public, anon;
revoke all on function public.get_penalty_records() from public, anon;
grant execute on function public.start_penalty_run() to authenticated;
grant execute on function public.take_penalty_shot(uuid,integer,text) to authenticated;
grant execute on function public.get_penalty_records() to authenticated;
notify pgrst, 'reload schema';
commit;

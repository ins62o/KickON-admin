-- B only: disposable PostgreSQL 17, network=none, no host DB volume or secrets.
-- Load this fixture, then the exact HEAD publish_fixture_lineup SQL (SHA-256
-- a8a78fcbd983860adb33004fd69e06ae68bd979904de0f435a9bacc4c5e30f2d).
-- This is not a service migration. Production notification triggers are absent.
\set ON_ERROR_STOP on
set statement_timeout = '3s';
set lock_timeout = '1s';
create role anon;
create role authenticated;
create role service_role;
create schema baseline_test;
create table public.teams(id text primary key);
insert into public.teams values ('home'), ('away');
create table public.fixtures(
 id text primary key, home_team_id text not null references public.teams,
 away_team_id text not null references public.teams, status text not null,
 kickoff_at timestamptz not null, lineup_announced_at timestamptz
);
create table public.fixture_lineups(
 fixture_id text not null references public.fixtures on delete cascade,
 team_id text not null references public.teams, formation text, coach_id text,
 coach_name text, fetched_at timestamptz not null default now(),
 primary key(fixture_id,team_id)
);
create table public.fixture_lineup_players(
 fixture_id text not null, team_id text not null, player_id text not null,
 player_name text not null, shirt_number integer, position text, grid text,
 role text not null check(role in ('STARTER','SUBSTITUTE')),
 sort_order integer not null default 0,
 primary key(fixture_id,team_id,player_id,role),
 foreign key(fixture_id,team_id) references public.fixture_lineups on delete cascade
);

create function baseline_test.reset_fixture(f text) returns void language plpgsql as $$
begin
 delete from public.fixtures where id=f;
 insert into public.fixtures values(f,'home','away','SCHEDULED',now()+interval '1 hour',null);
 insert into public.fixture_lineups(fixture_id,team_id,formation)
 values(f,'home','original'),(f,'away','original');
 insert into public.fixture_lineup_players(fixture_id,team_id,player_id,player_name,role,sort_order)
 select f,t.team,(t.offset_id+n)::text,'original','STARTER',n
 from (values('home',100),('away',200)) t(team,offset_id) cross join generate_series(1,11) n;
 -- A prior valid four-column-key snapshot contains both roles for one player.
 insert into public.fixture_lineup_players(fixture_id,team_id,player_id,player_name,role)
 values(f,'home','101','original','SUBSTITUTE');
end;
$$;

create function baseline_test.snapshot(f text) returns jsonb language sql as $$
 select jsonb_build_object(
  'fixture',(select to_jsonb(x) from public.fixtures x where id=f),
  'lineups',(select jsonb_agg(to_jsonb(x) order by team_id) from public.fixture_lineups x where fixture_id=f),
  'players',(select jsonb_agg(to_jsonb(x) order by team_id,player_id,role) from public.fixture_lineup_players x where fixture_id=f)
 );
$$;

create function baseline_test.run_case(label text, lines jsonb, players jsonb, expected text)
returns jsonb language plpgsql as $$
declare before_state jsonb; after_state jsonb; outcome text:='OK';
begin
 perform baseline_test.reset_fixture('fixture-b');
 before_state:=baseline_test.snapshot('fixture-b');
 begin
  perform public.publish_fixture_lineup('fixture-b',lines,players);
 exception when others then get stacked diagnostics outcome=returned_sqlstate;
 end;
 after_state:=baseline_test.snapshot('fixture-b');
 if outcome<>expected then raise exception 'UNEXPECTED_CASE_OUTCOME: %',label; end if;
 if outcome<>'OK' and after_state is distinct from before_state then
  raise exception 'RPC_REJECTION_CHANGED_EXISTING_DATA: %',label;
 end if;
 if outcome='OK' and (
  (select count(*) from public.fixture_lineup_players where fixture_id='fixture-b')<>jsonb_array_length(players)
  or (select count(distinct player_id) from public.fixture_lineup_players where fixture_id='fixture-b' and team_id='home' and role='STARTER')<>11
  or (select count(distinct player_id) from public.fixture_lineup_players where fixture_id='fixture-b' and team_id='away' and role='STARTER')<>11
  or (select lineup_announced_at is null from public.fixtures where id='fixture-b')
 ) then raise exception 'INCOMPLETE_COMMITTED_LINEUP: %',label; end if;
 return jsonb_build_object('case',label,'code',outcome,'preserved_on_error',
  case when outcome<>'OK' then before_state=after_state else null end,
  'players',(select count(*) from public.fixture_lineup_players where fixture_id='fixture-b'),
  'substitutes',(select count(*) from public.fixture_lineup_players where fixture_id='fixture-b' and role='SUBSTITUTE'));
end;
$$;

-- For two-session tests: actual fixture row lock must serialize same-fixture
-- publication; another fixture remains independent. There is no version/CAS
-- argument in this legacy RPC, so a later valid stale payload can replace data.
create function baseline_test.writer(f text, marker text) returns void language plpgsql as $$
declare lines jsonb; players jsonb;
begin
 select jsonb_agg(jsonb_build_object('fixture_id',f,'team_id',t,'formation',marker,
  'fetched_at','2026-10-26T00:00:00Z')) into lines from unnest(array['home','away']) t;
 select jsonb_agg(jsonb_build_object('fixture_id',f,'team_id',t.team,
  'player_id',(t.offset_id+n)::text,'player_name',marker,'role','STARTER','sort_order',n))
 into players from (values('home',100),('away',200)) t(team,offset_id) cross join generate_series(1,11) n;
 perform public.publish_fixture_lineup(f,lines,players);
end;
$$;

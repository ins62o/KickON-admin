create extension if not exists pgcrypto;

create table public.teams (
  id text primary key,
  name text not null,
  short_name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '' check (
    nickname = '' or (
      char_length(nickname) between 2 and 12 and
      nickname ~ '^[가-힣A-Za-z0-9_]+$'
    )
  ),
  team_id text references public.teams(id),
  team_selected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_nickname_unique_idx
on public.profiles (lower(nickname))
where nickname <> '';

create table public.stadiums (
  id text primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  created_at timestamptz not null default now()
);

create table public.fixtures (
  id text primary key,
  league_id text not null,
  round integer,
  home_team_id text not null references public.teams(id),
  away_team_id text not null references public.teams(id),
  stadium_id text not null references public.stadiums(id),
  kickoff_at timestamptz not null,
  status text not null check (status in ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED')),
  home_score integer,
  away_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fixtures_kickoff_at_idx on public.fixtures(kickoff_at);
create index fixtures_home_team_idx on public.fixtures(home_team_id, kickoff_at);
create index fixtures_away_team_idx on public.fixtures(away_team_id, kickoff_at);

create table public.league_standings (
  season integer not null,
  league_id text not null,
  team_id text not null references public.teams(id),
  rank integer not null,
  played integer not null default 0,
  points integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, league_id, team_id)
);

create table public.player_scoring_stats (
  season integer not null,
  league_id text not null,
  team_id text not null references public.teams(id),
  player_id text not null,
  player_name text not null,
  goals integer not null default 0,
  appearances integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season, league_id, player_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('LEAGUE', 'TEAM')),
  team_id text not null references public.teams(id),
  category text not null check (category in ('FREE', 'CHEER', 'REVIEW', 'NOTICE')),
  title text not null check (char_length(title) between 2 and 100),
  content text not null check (char_length(content) between 5 and 10000),
  image_urls text[] not null default '{}',
  author_id uuid not null references public.profiles(id) on delete cascade,
  view_count integer not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_board_created_idx on public.posts(board, created_at desc);
create index posts_team_created_idx on public.posts(team_id, created_at desc);
create index posts_author_idx on public.posts(author_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_post_idx on public.comments(post_id, created_at);
create index comments_user_idx on public.comments(user_id, created_at desc);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_idx on public.post_likes(user_id, created_at desc);

create table public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, viewed_on)
);

create table public.attendances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fixture_id text not null references public.fixtures(id) on delete cascade,
  team_id text not null references public.teams(id),
  stadium_id text not null references public.stadiums(id),
  verified_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  distance_from_stadium double precision not null check (distance_from_stadium >= 0),
  verification_type text not null check (verification_type in ('GPS', 'MANUAL')),
  result text not null default 'PENDING' check (result in ('WIN', 'DRAW', 'LOSS', 'PENDING')),
  unique (user_id, fixture_id)
);

create index attendances_user_idx on public.attendances(user_id, verified_at desc);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  match_notifications_enabled boolean not null default true,
  lineup_notifications_enabled boolean not null default true,
  community_notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('MATCH', 'LINEUP', 'COMMUNITY', 'SYSTEM')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx
on public.notifications(user_id, created_at desc);

create unique index notifications_user_dedupe_idx
on public.notifications(user_id, dedupe_key)
where dedupe_key is not null;

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens(user_id);

create or replace function public.register_push_token(
  device_token text,
  device_platform text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if device_platform not in ('ios', 'android') then
    raise exception 'INVALID_PUSH_PLATFORM';
  end if;
  if char_length(device_token) < 16 or char_length(device_token) > 4096 then
    raise exception 'INVALID_PUSH_TOKEN';
  end if;

  delete from public.push_tokens where token = device_token;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (device_token, auth.uid(), device_platform, now());
end;
$$;

create or replace function public.unregister_push_token(device_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens
  where token = device_token and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text, text) from public;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_team_change_cooldown()
returns trigger
language plpgsql
as $$
begin
  if new.team_id is distinct from old.team_id then
    if old.team_id is not null and new.team_id is null then
      raise exception 'TEAM_REQUIRED';
    end if;
    if old.team_id is not null
      and old.team_selected_at is not null
      and old.team_selected_at > now() - interval '30 days' then
      raise exception 'TEAM_CHANGE_COOLDOWN';
    end if;
    new.team_selected_at = now();
  else
    new.team_selected_at = old.team_selected_at;
  end if;
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger profiles_enforce_team_change_cooldown before update on public.profiles
for each row execute function public.enforce_team_change_cooldown();
create trigger fixtures_touch_updated_at before update on public.fixtures
for each row execute function public.touch_updated_at();
create trigger posts_touch_updated_at before update on public.posts
for each row execute function public.touch_updated_at();
create trigger comments_touch_updated_at before update on public.comments
for each row execute function public.touch_updated_at();
create trigger notification_preferences_touch_updated_at before update on public.notification_preferences
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    ''
  );
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.fan_level_for_score(activity_score bigint)
returns text
language sql
immutable
as $$
  select case
    when activity_score >= 100 then 'LEGEND'
    when activity_score >= 60 then 'CORE_FAN'
    when activity_score >= 30 then 'PASSIONATE_FAN'
    when activity_score >= 10 then 'SUPPORTER'
    else 'FAN'
  end;
$$;

create or replace function public.fan_activity_score(target_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (select count(*) from public.posts where author_id = target_user_id) +
    (select count(*) from public.comments where user_id = target_user_id) +
    (select count(*) from public.attendances where user_id = target_user_id)
  )::bigint;
$$;

revoke all on function public.fan_activity_score(uuid) from public;
grant execute on function public.fan_activity_score(uuid) to authenticated;

create view public.profile_activity
with (security_invoker = true)
as
select
  profile.id as user_id,
  public.fan_activity_score(profile.id) as activity_score
from public.profiles profile;

create view public.community_post_feed
with (security_invoker = true)
as
select
  post.id,
  post.board,
  post.team_id,
  post.category,
  post.title,
  post.content,
  post.image_urls,
  post.author_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_score(public.fan_activity_score(profile.id)) as author_fan_level_id,
  post.created_at,
  post.view_count,
  (select count(*) from public.comments where post_id = post.id)::integer as comment_count,
  (select count(*) from public.post_likes where post_id = post.id)::integer as like_count
from public.posts post
join public.profiles profile on profile.id = post.author_id;

create view public.community_comment_feed
with (security_invoker = true)
as
select
  comment.id,
  comment.post_id,
  post.title as post_title,
  comment.user_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_score(public.fan_activity_score(profile.id)) as author_fan_level_id,
  comment.content,
  comment.created_at
from public.comments comment
join public.posts post on post.id = comment.post_id
join public.profiles profile on profile.id = comment.user_id;

create or replace function public.search_community_posts(
  target_board text,
  target_team_id text,
  search_query text
)
returns setof public.community_post_feed
language sql
stable
set search_path = ''
as $$
  select post.*
  from public.community_post_feed post
  where post.board = target_board
    and (target_team_id is null or post.team_id = target_team_id)
    and char_length(trim(search_query)) between 1 and 50
    and (
      strpos(lower(post.title), lower(trim(search_query))) > 0 or
      strpos(lower(post.content), lower(trim(search_query))) > 0 or
      strpos(lower(post.author_nickname), lower(trim(search_query))) > 0
    )
  order by post.created_at desc
  limit 100;
$$;

revoke all on function public.search_community_posts(text, text, text) from public;
grant execute on function public.search_community_posts(text, text, text) to authenticated;

create or replace function public.increment_post_view(target_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  resulting_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  insert into public.post_views (post_id, user_id, viewed_on)
  select post.id, auth.uid(), current_date
  from public.posts post
  where post.id = target_post_id
    and (
      post.board = 'LEAGUE' or
      post.team_id = (
        select profile.team_id
        from public.profiles profile
        where profile.id = auth.uid()
      )
    )
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.posts
    set view_count = view_count + 1
    where id = target_post_id
    returning view_count into resulting_count;
  else
    select post.view_count into resulting_count
    from public.posts post
    where post.id = target_post_id
      and (
        post.board = 'LEAGUE' or
        post.team_id = (
          select profile.team_id
          from public.profiles profile
          where profile.id = auth.uid()
        )
      );
    if not found then raise exception 'POST_NOT_FOUND'; end if;
  end if;

  return resulting_count;
end;
$$;

revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to authenticated;
grant select on public.profile_activity, public.community_post_feed, public.community_comment_feed to authenticated;

create or replace function public.create_gps_attendance(
  target_fixture_id text,
  current_latitude double precision,
  current_longitude double precision
)
returns public.attendances
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fixture public.fixtures;
  target_stadium public.stadiums;
  profile_team_id text;
  calculated_distance double precision;
  created_attendance public.attendances;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if current_latitude not between -90 and 90
    or current_longitude not between -180 and 180 then
    raise exception 'INVALID_LOCATION';
  end if;

  select team_id into profile_team_id
  from public.profiles
  where id = auth.uid();

  select * into target_fixture
  from public.fixtures
  where id = target_fixture_id;
  if not found then raise exception 'FIXTURE_NOT_FOUND'; end if;

  if profile_team_id is null or profile_team_id not in (
    target_fixture.home_team_id,
    target_fixture.away_team_id
  ) then
    raise exception 'TEAM_NOT_IN_FIXTURE';
  end if;
  if target_fixture.status = 'CANCELED' then
    raise exception 'FIXTURE_CANCELED';
  end if;
  if now() < target_fixture.kickoff_at - interval '2 hours' then
    raise exception 'ATTENDANCE_TOO_EARLY';
  end if;
  if now() > target_fixture.kickoff_at + interval '3 hours' then
    raise exception 'ATTENDANCE_TOO_LATE';
  end if;

  select * into target_stadium
  from public.stadiums
  where id = target_fixture.stadium_id;

  calculated_distance := 6371000 * 2 * asin(sqrt(least(1,
    power(sin(radians(target_stadium.latitude - current_latitude) / 2), 2) +
    cos(radians(current_latitude)) * cos(radians(target_stadium.latitude)) *
    power(sin(radians(target_stadium.longitude - current_longitude) / 2), 2)
  )));
  if calculated_distance > 300 then
    raise exception 'ATTENDANCE_TOO_FAR';
  end if;

  insert into public.attendances (
    user_id,
    fixture_id,
    team_id,
    stadium_id,
    latitude,
    longitude,
    distance_from_stadium,
    verification_type,
    result
  ) values (
    auth.uid(),
    target_fixture.id,
    profile_team_id,
    target_fixture.stadium_id,
    current_latitude,
    current_longitude,
    round(calculated_distance),
    'GPS',
    case
      when target_fixture.status <> 'FINISHED' then 'PENDING'
      when target_fixture.home_score = target_fixture.away_score then 'DRAW'
      when profile_team_id = target_fixture.home_team_id and target_fixture.home_score > target_fixture.away_score then 'WIN'
      when profile_team_id = target_fixture.away_team_id and target_fixture.away_score > target_fixture.home_score then 'WIN'
      else 'LOSS'
    end
  )
  returning * into created_attendance;

  return created_attendance;
exception
  when unique_violation then raise exception 'ALREADY_VERIFIED';
end;
$$;

revoke all on function public.create_gps_attendance(text, double precision, double precision) from public;
grant execute on function public.create_gps_attendance(text, double precision, double precision) to authenticated;

create or replace function public.sync_attendance_results()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'FINISHED' and new.home_score is not null and new.away_score is not null then
    update public.attendances
    set result = case
      when new.home_score = new.away_score then 'DRAW'
      when team_id = new.home_team_id and new.home_score > new.away_score then 'WIN'
      when team_id = new.away_team_id and new.away_score > new.home_score then 'WIN'
      else 'LOSS'
    end
    where fixture_id = new.id;
  end if;
  return new;
end;
$$;

create trigger fixtures_sync_attendance_results
after insert or update on public.fixtures
for each row execute function public.sync_attendance_results();

create or replace function public.create_community_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts;
  commenter_nickname text;
begin
  select * into target_post from public.posts where id = new.post_id;
  if target_post.author_id = new.user_id then return new; end if;
  if not exists (
    select 1 from public.notification_preferences preference
    where preference.user_id = target_post.author_id
      and preference.community_notifications_enabled
  ) then return new; end if;

  select nickname into commenter_nickname
  from public.profiles where id = new.user_id;

  insert into public.notifications (
    user_id, type, title, body, data, dedupe_key
  ) values (
    target_post.author_id,
    'COMMUNITY',
    '내 글에 새 댓글이 달렸어요',
    coalesce(commenter_nickname, '팬') || ' · ' || left(new.content, 120),
    jsonb_build_object('postId', new.post_id::text),
    'comment:' || new.id::text
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end;
$$;

create trigger comments_create_notification
after insert on public.comments
for each row execute function public.create_community_comment_notification();

create or replace function public.create_fixture_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '새 경기 일정이 등록됐어요',
      '응원팀의 경기 일정을 확인해보세요.',
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id),
      'fixture-scheduled:' || new.id
    from public.profiles profile
    join public.notification_preferences preference on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  if new.status = 'LIVE' and (tg_op = 'INSERT' or old.status is distinct from 'LIVE') then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'MATCH',
      '응원팀 경기가 시작됐어요',
      '지금 경기와 팬들의 이야기를 확인해보세요.',
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id),
      'fixture-live:' || new.id
    from public.profiles profile
    join public.notification_preferences preference on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.match_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

create trigger fixtures_create_notifications
after insert or update on public.fixtures
for each row execute function public.create_fixture_notifications();

create or replace function public.sync_football_data(
  payload_fixtures jsonb,
  payload_standings jsonb,
  payload_scorers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fixtures (
    id,
    league_id,
    round,
    home_team_id,
    away_team_id,
    stadium_id,
    kickoff_at,
    status,
    home_score,
    away_score
  )
  select
    fixture.id,
    fixture.league_id,
    fixture.round,
    fixture.home_team_id,
    fixture.away_team_id,
    fixture.stadium_id,
    fixture.kickoff_at,
    fixture.status,
    fixture.home_score,
    fixture.away_score
  from jsonb_to_recordset(coalesce(payload_fixtures, '[]'::jsonb)) as fixture(
    id text,
    league_id text,
    round integer,
    home_team_id text,
    away_team_id text,
    stadium_id text,
    kickoff_at timestamptz,
    status text,
    home_score integer,
    away_score integer
  )
  on conflict (id) do update set
    league_id = excluded.league_id,
    round = excluded.round,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    stadium_id = excluded.stadium_id,
    kickoff_at = excluded.kickoff_at,
    status = excluded.status,
    home_score = excluded.home_score,
    away_score = excluded.away_score;

  insert into public.league_standings (
    season,
    league_id,
    team_id,
    rank,
    played,
    points,
    won,
    drawn,
    lost,
    goals_for,
    goals_against,
    goal_difference,
    updated_at
  )
  select
    standing.season,
    standing.league_id,
    standing.team_id,
    standing.rank,
    standing.played,
    standing.points,
    standing.won,
    standing.drawn,
    standing.lost,
    standing.goals_for,
    standing.goals_against,
    standing.goal_difference,
    now()
  from jsonb_to_recordset(coalesce(payload_standings, '[]'::jsonb)) as standing(
    season integer,
    league_id text,
    team_id text,
    rank integer,
    played integer,
    points integer,
    won integer,
    drawn integer,
    lost integer,
    goals_for integer,
    goals_against integer,
    goal_difference integer
  )
  on conflict (season, league_id, team_id) do update set
    rank = excluded.rank,
    played = excluded.played,
    points = excluded.points,
    won = excluded.won,
    drawn = excluded.drawn,
    lost = excluded.lost,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    goal_difference = excluded.goal_difference,
    updated_at = now();

  insert into public.player_scoring_stats (
    season,
    league_id,
    team_id,
    player_id,
    player_name,
    goals,
    appearances,
    updated_at
  )
  select
    scorer.season,
    scorer.league_id,
    scorer.team_id,
    scorer.player_id,
    scorer.player_name,
    scorer.goals,
    scorer.appearances,
    now()
  from jsonb_to_recordset(coalesce(payload_scorers, '[]'::jsonb)) as scorer(
    season integer,
    league_id text,
    team_id text,
    player_id text,
    player_name text,
    goals integer,
    appearances integer
  )
  on conflict (season, league_id, player_id) do update set
    team_id = excluded.team_id,
    player_name = excluded.player_name,
    goals = excluded.goals,
    appearances = excluded.appearances,
    updated_at = now();

  return jsonb_build_object(
    'fixtures', jsonb_array_length(coalesce(payload_fixtures, '[]'::jsonb)),
    'league_standings', jsonb_array_length(coalesce(payload_standings, '[]'::jsonb)),
    'player_scoring_stats', jsonb_array_length(coalesce(payload_scorers, '[]'::jsonb))
  );
end;
$$;

revoke all on function public.sync_football_data(jsonb, jsonb, jsonb) from public;
grant execute on function public.sync_football_data(jsonb, jsonb, jsonb) to service_role;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.stadiums enable row level security;
alter table public.fixtures enable row level security;
alter table public.league_standings enable row level security;
alter table public.player_scoring_stats enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_views enable row level security;
alter table public.attendances enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

revoke update on public.profiles from authenticated;
grant update (nickname, team_id) on public.profiles to authenticated;

revoke insert, update on public.posts from authenticated;
grant insert (
  board, team_id, category, title, content, image_urls, author_id
) on public.posts to authenticated;

revoke insert, update on public.comments from authenticated;
grant insert (post_id, user_id, content) on public.comments to authenticated;

revoke insert, update on public.post_likes from authenticated;
grant insert (post_id, user_id) on public.post_likes to authenticated;

revoke all on public.post_views from anon, authenticated;

revoke update on public.notification_preferences from authenticated;
grant update (
  match_notifications_enabled,
  lineup_notifications_enabled,
  community_notifications_enabled
) on public.notification_preferences to authenticated;

revoke update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on public.push_tokens from anon, authenticated;

create policy "authenticated users read teams" on public.teams for select to authenticated using (true);
create policy "authenticated users read profiles" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "authenticated users read stadiums" on public.stadiums for select to authenticated using (true);
create policy "authenticated users read fixtures" on public.fixtures for select to authenticated using (true);
create policy "authenticated users read standings" on public.league_standings for select to authenticated using (true);
create policy "authenticated users read scoring stats" on public.player_scoring_stats for select to authenticated using (true);
create policy "authenticated users read accessible posts" on public.posts for select to authenticated
using (
  board = 'LEAGUE' or
  team_id = (select profile.team_id from public.profiles profile where profile.id = auth.uid())
);
create policy "users create own posts" on public.posts for insert to authenticated
with check (
  author_id = auth.uid() and
  category = 'FREE' and
  team_id = (select profile.team_id from public.profiles profile where profile.id = auth.uid())
);
create policy "users delete own posts" on public.posts for delete to authenticated using (author_id = auth.uid());
create policy "authenticated users read accessible comments" on public.comments for select to authenticated
using (
  exists (
    select 1 from public.posts post
    where post.id = comments.post_id
  )
);
create policy "users create comments on accessible posts" on public.comments for insert to authenticated
with check (
  user_id = auth.uid() and
  exists (
    select 1 from public.posts post
    where post.id = comments.post_id
  )
);
create policy "users delete own comments" on public.comments for delete to authenticated using (user_id = auth.uid());
create policy "authenticated users read accessible likes" on public.post_likes for select to authenticated
using (
  exists (
    select 1 from public.posts post
    where post.id = post_likes.post_id
  )
);
create policy "users like accessible posts" on public.post_likes for insert to authenticated
with check (
  user_id = auth.uid() and
  exists (
    select 1 from public.posts post
    where post.id = post_likes.post_id
  )
);
create policy "users delete own likes" on public.post_likes for delete to authenticated using (user_id = auth.uid());
create policy "users read own attendances" on public.attendances for select to authenticated using (user_id = auth.uid());
create policy "users read own notification preferences" on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy "users update own notification preferences" on public.notification_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table
  public.profiles,
  public.fixtures,
  public.league_standings,
  public.player_scoring_stats,
  public.posts,
  public.comments,
  public.post_likes,
  public.attendances,
  public.notification_preferences,
  public.notifications;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'post-images',
  'post-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "public reads post images" on storage.objects for select using (bucket_id = 'post-images');
create policy "users upload own post images" on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-images' and
  (storage.foldername(name))[1] = auth.uid()::text
);
create policy "users delete own post images" on storage.objects for delete to authenticated
using (
  bucket_id = 'post-images' and
  (storage.foldername(name))[1] = auth.uid()::text
);

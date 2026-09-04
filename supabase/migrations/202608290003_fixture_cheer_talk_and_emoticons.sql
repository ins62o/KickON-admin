alter table public.posts
  add column if not exists emoticon_key text;
alter table public.comments
  add column if not exists emoticon_key text;

alter table public.posts
  drop constraint if exists posts_emoticon_key_check;
alter table public.posts
  add constraint posts_emoticon_key_check
  check (
    emoticon_key is null or
    emoticon_key ~ '^[a-z0-9-]+:(victory|chant|love|goal|pride|believe|referee|wake-up)$'
  );

alter table public.comments
  drop constraint if exists comments_emoticon_key_check;
alter table public.comments
  add constraint comments_emoticon_key_check
  check (
    emoticon_key is null or
    emoticon_key ~ '^[a-z0-9-]+:(victory|chant|love|goal|pride|believe|referee|wake-up)$'
  );

create table public.fixture_cheer_messages (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null references public.fixtures(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id text not null references public.teams(id),
  content text,
  emoticon_key text,
  created_at timestamptz not null default now(),
  constraint fixture_cheer_message_body_check check (
    (content is not null and char_length(trim(content)) between 1 and 80) or
    emoticon_key is not null
  ),
  constraint fixture_cheer_emoticon_key_check check (
    emoticon_key is null or
    emoticon_key ~ '^[a-z0-9-]+:(victory|chant|love|goal|pride|believe|referee|wake-up)$'
  )
);

create index fixture_cheer_messages_fixture_created_idx
  on public.fixture_cheer_messages (fixture_id, created_at desc);
create index fixture_cheer_messages_user_created_idx
  on public.fixture_cheer_messages (user_id, created_at desc);

alter table public.fixture_cheer_messages enable row level security;
grant select on public.fixture_cheer_messages to anon, authenticated;

create policy "everyone reads fixture cheers"
  on public.fixture_cheer_messages for select
  to anon, authenticated using (true);

create or replace view public.fixture_cheer_feed
with (security_invoker = true)
as
select
  cheer.id,
  cheer.fixture_id,
  cheer.user_id,
  cheer.team_id,
  profile.nickname as author_nickname,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  cheer.content,
  cheer.emoticon_key,
  cheer.created_at
from public.fixture_cheer_messages cheer
join public.profiles profile on profile.id = cheer.user_id;

grant select on public.fixture_cheer_feed to anon, authenticated;

create or replace function public.send_fixture_cheer(
  target_fixture_id text,
  message_content text default null,
  target_emoticon_key text default null
)
returns public.fixture_cheer_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile public.profiles;
  current_level text;
  normalized_content text;
  created_message public.fixture_cheer_messages;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid();

  if current_profile.team_id is null then
    raise exception 'TEAM_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.fixtures fixture
    where fixture.id = target_fixture_id
      and fixture.status = 'LIVE'
  ) then
    raise exception 'CHEER_TALK_NOT_LIVE';
  end if;

  normalized_content := nullif(trim(coalesce(message_content, '')), '');
  if normalized_content is not null and char_length(normalized_content) > 80 then
    raise exception 'CHEER_MESSAGE_TOO_LONG';
  end if;
  if normalized_content is null and target_emoticon_key is null then
    raise exception 'CHEER_MESSAGE_REQUIRED';
  end if;

  if target_emoticon_key is not null then
    if target_emoticon_key !~ '^[a-z0-9-]+:(victory|chant|love|goal|pride|believe|referee|wake-up)$' or
       split_part(target_emoticon_key, ':', 1) <> current_profile.team_id then
      raise exception 'INVALID_TEAM_EMOTICON';
    end if;

    current_level := public.fan_level_for_user(auth.uid());
    if current_level not in ('PASSIONATE_FAN', 'CORE_FAN', 'LEGEND') then
      raise exception 'EMOTICON_REQUIRES_PASSIONATE_FAN';
    end if;
  end if;

  if exists (
    select 1
    from public.fixture_cheer_messages recent
    where recent.user_id = auth.uid()
      and recent.created_at > now() - interval '3 seconds'
  ) then
    raise exception 'CHEER_RATE_LIMITED';
  end if;

  insert into public.fixture_cheer_messages (
    fixture_id,
    user_id,
    team_id,
    content,
    emoticon_key
  )
  values (
    target_fixture_id,
    auth.uid(),
    current_profile.team_id,
    normalized_content,
    target_emoticon_key
  )
  returning * into created_message;

  return created_message;
end;
$$;

revoke all on function public.send_fixture_cheer(text, text, text)
  from public, anon;
grant execute on function public.send_fixture_cheer(text, text, text)
  to authenticated;

create or replace function public.enforce_community_emoticon_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_team_id text;
  current_level text;
begin
  if new.emoticon_key is null then
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select team_id into profile_team_id
  from public.profiles
  where id = auth.uid();

  if split_part(new.emoticon_key, ':', 1) <> profile_team_id then
    raise exception 'INVALID_TEAM_EMOTICON';
  end if;

  current_level := public.fan_level_for_user(auth.uid());
  if current_level not in ('PASSIONATE_FAN', 'CORE_FAN', 'LEGEND') then
    raise exception 'EMOTICON_REQUIRES_PASSIONATE_FAN';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_community_emoticon_access()
  from public, anon, authenticated;

create trigger posts_enforce_emoticon_access
before insert or update of emoticon_key on public.posts
for each row execute function public.enforce_community_emoticon_access();

create trigger comments_enforce_emoticon_access
before insert or update of emoticon_key on public.comments
for each row execute function public.enforce_community_emoticon_access();

revoke insert, update on public.posts from authenticated;
grant insert (
  board, team_id, category, title, content, image_urls, emoticon_key, author_id
) on public.posts to authenticated;

revoke insert, update on public.comments from authenticated;
grant insert (post_id, user_id, content, emoticon_key)
  on public.comments to authenticated;

create or replace view public.community_post_feed
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
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  post.created_at,
  post.view_count,
  (select count(*) from public.comments where post_id = post.id)::integer as comment_count,
  (select count(*) from public.post_likes where post_id = post.id)::integer as like_count,
  post.emoticon_key
from public.posts post
join public.profiles profile on profile.id = post.author_id;

create or replace view public.community_comment_feed
with (security_invoker = true)
as
select
  comment.id,
  comment.post_id,
  post.title as post_title,
  comment.user_id,
  profile.nickname as author_nickname,
  profile.team_id as author_team_id,
  public.fan_level_for_user(profile.id) as author_fan_level_id,
  comment.content,
  comment.created_at,
  comment.emoticon_key
from public.comments comment
join public.posts post on post.id = comment.post_id
join public.profiles profile on profile.id = comment.user_id;

grant select on public.community_post_feed to anon, authenticated;
grant select on public.community_comment_feed to anon, authenticated;

select cron.schedule(
  'kickon-fixture-cheer-retention',
  '43 3 * * *',
  $cron$delete from public.fixture_cheer_messages where created_at < now() - interval '48 hours';$cron$
);

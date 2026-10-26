-- Server-owned fan activity ledger. All dates and daily caps use Korea time.
create table public.fan_activity_content_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in ('POST_CREATE', 'COMMENT_CREATE')),
  content_hash text not null,
  source_id uuid not null,
  claimed_at timestamptz not null,
  primary key (user_id, activity_type, content_hash)
);

create table public.fan_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  activity_type text not null check (
    activity_type in ('POST_READ', 'POST_CREATE', 'COMMENT_CREATE', 'POST_LIKE_RECEIVED')
  ),
  source_id uuid not null,
  parent_post_id uuid,
  actor_user_id uuid,
  dedupe_key text not null unique,
  base_points smallint not null check (base_points between 0 and 3),
  awarded_points smallint not null default 0 check (awarded_points between 0 and 3),
  counts_activity_day boolean not null default false,
  is_valid boolean not null default true,
  invalidation_reason text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index fan_activity_events_user_date_idx
  on public.fan_activity_events(user_id, activity_date, occurred_at, id);
create index fan_activity_events_source_idx
  on public.fan_activity_events(activity_type, source_id);

alter table public.fan_activity_content_claims enable row level security;
alter table public.fan_activity_events enable row level security;
revoke all on public.fan_activity_content_claims, public.fan_activity_events
  from public, anon, authenticated;
grant all on public.fan_activity_content_claims, public.fan_activity_events
  to service_role;

create or replace function public.claim_fan_activity_content(
  target_user_id uuid,
  target_activity_type text,
  target_source_id uuid,
  target_content text,
  target_occurred_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  normalized_hash text;
begin
  normalized_hash := md5(
    lower(regexp_replace(trim(coalesce(target_content, '')), '\s+', ' ', 'g'))
  );
  insert into public.fan_activity_content_claims (
    user_id, activity_type, content_hash, source_id, claimed_at
  ) values (
    target_user_id, target_activity_type, normalized_hash,
    target_source_id, target_occurred_at
  ) on conflict do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function public.recalculate_fan_activity_day(
  target_user_id uuid,
  target_activity_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.fan_activity_events;
  daily_total integer := 0;
  type_total integer := 0;
  type_cap integer := 0;
  next_award integer := 0;
  credited_likers uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(
    hashtextextended(target_user_id::text || ':' || target_activity_date::text, 0)
  );

  update public.fan_activity_events
  set awarded_points = 0
  where user_id = target_user_id and activity_date = target_activity_date;

  for event_row in
    select * from public.fan_activity_events
    where user_id = target_user_id
      and activity_date = target_activity_date
      and is_valid
      and base_points > 0
    order by occurred_at, id
  loop
    type_cap := case event_row.activity_type
      when 'POST_READ' then 1
      when 'POST_CREATE' then 3
      when 'COMMENT_CREATE' then 6
      when 'POST_LIKE_RECEIVED' then 5
      else 0
    end;

    if event_row.activity_type = 'POST_LIKE_RECEIVED'
       and event_row.actor_user_id = any(credited_likers) then
      next_award := 0;
    else
      select coalesce(sum(awarded_points), 0)::integer into type_total
      from public.fan_activity_events
      where user_id = target_user_id
        and activity_date = target_activity_date
        and activity_type = event_row.activity_type;
      next_award := greatest(
        0,
        least(event_row.base_points, type_cap - type_total, 15 - daily_total)
      );
    end if;

    update public.fan_activity_events
    set awarded_points = next_award
    where id = event_row.id;
    daily_total := daily_total + next_award;
    if event_row.activity_type = 'POST_LIKE_RECEIVED'
       and next_award > 0 then
      credited_likers := array_append(credited_likers, event_row.actor_user_id);
    end if;
  end loop;
end;
$$;

create or replace function public.record_fan_activity_event(
  target_user_id uuid,
  target_activity_type text,
  target_source_id uuid,
  target_parent_post_id uuid,
  target_actor_user_id uuid,
  target_base_points smallint,
  target_counts_activity_day boolean,
  target_is_valid boolean,
  target_invalidation_reason text,
  target_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_date date := (target_occurred_at at time zone 'Asia/Seoul')::date;
  event_key text;
begin
  event_key := target_activity_type || ':' || target_source_id::text || ':' ||
    coalesce(target_actor_user_id::text, target_user_id::text) ||
    case when target_activity_type = 'POST_READ' then ':' || event_date::text else '' end;

  insert into public.fan_activity_events (
    user_id, activity_date, activity_type, source_id, parent_post_id,
    actor_user_id, dedupe_key, base_points, counts_activity_day, is_valid,
    invalidation_reason, occurred_at
  ) values (
    target_user_id, event_date, target_activity_type, target_source_id,
    target_parent_post_id, target_actor_user_id, event_key,
    target_base_points, target_counts_activity_day, target_is_valid,
    target_invalidation_reason, target_occurred_at
  )
  on conflict (dedupe_key) do update set
    is_valid = excluded.is_valid,
    invalidation_reason = excluded.invalidation_reason;

  perform public.recalculate_fan_activity_day(target_user_id, event_date);
end;
$$;

create or replace function public.capture_fan_activity_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_row public.posts;
  content_is_new boolean := true;
  target_user uuid;
  base_points smallint;
  valid_event boolean;
  invalid_reason text;
begin
  if tg_table_name = 'post_views' then
    perform public.record_fan_activity_event(
      new.user_id, 'POST_READ', new.post_id, new.post_id, new.user_id,
      1, true, true, null, new.created_at
    );
  elsif tg_table_name = 'posts' then
    content_is_new := public.claim_fan_activity_content(
      new.author_id, 'POST_CREATE', new.id, new.title || E'\n' || new.content,
      new.created_at
    );
    perform public.record_fan_activity_event(
      new.author_id, 'POST_CREATE', new.id, new.id, new.author_id,
      case when content_is_new then 3 else 0 end::smallint, true,
      new.moderation_status = 'VISIBLE',
      case when not content_is_new then 'DUPLICATE_CONTENT'
           when new.moderation_status <> 'VISIBLE' then 'MODERATION_HIDDEN' end,
      new.created_at
    );
  elsif tg_table_name = 'comments' then
    select * into post_row from public.posts where id = new.post_id;
    content_is_new := public.claim_fan_activity_content(
      new.user_id, 'COMMENT_CREATE', new.id, new.content, new.created_at
    );
    valid_event := new.moderation_status = 'VISIBLE'
      and post_row.moderation_status = 'VISIBLE';
    base_points := case
      when new.user_id = post_row.author_id or not content_is_new then 0 else 2
    end;
    invalid_reason := case
      when not content_is_new then 'DUPLICATE_CONTENT'
      when new.user_id = post_row.author_id then 'SELF_POST_COMMENT'
      when not valid_event then 'MODERATION_HIDDEN' end;
    perform public.record_fan_activity_event(
      new.user_id, 'COMMENT_CREATE', new.id, new.post_id, new.user_id,
      base_points, true, valid_event, invalid_reason, new.created_at
    );
  elsif tg_table_name = 'post_likes' then
    select * into post_row from public.posts where id = new.post_id;
    target_user := post_row.author_id;
    valid_event := post_row.moderation_status = 'VISIBLE';
    base_points := case when target_user = new.user_id then 0 else 1 end;
    perform public.record_fan_activity_event(
      target_user, 'POST_LIKE_RECEIVED', new.post_id, new.post_id, new.user_id,
      base_points, false, valid_event,
      case when target_user = new.user_id then 'SELF_LIKE'
           when not valid_event then 'MODERATION_HIDDEN' end,
      new.created_at
    );
  end if;
  return new;
end;
$$;

create or replace function public.sync_fan_activity_validity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  should_be_valid boolean;
begin
  if tg_table_name = 'post_likes' then
    for event_row in
      update public.fan_activity_events set
        is_valid = false, invalidation_reason = 'LIKE_REMOVED'
      where activity_type = 'POST_LIKE_RECEIVED'
        and source_id = old.post_id and actor_user_id = old.user_id
      returning user_id, activity_date
    loop
      perform public.recalculate_fan_activity_day(event_row.user_id, event_row.activity_date);
    end loop;
    return old;
  end if;

  if tg_table_name = 'comments' then
    if tg_op = 'DELETE' then
      should_be_valid := false;
    else
      should_be_valid := new.moderation_status = 'VISIBLE'
        and exists (
          select 1 from public.posts post
          where post.id = new.post_id and post.moderation_status = 'VISIBLE'
        );
    end if;
    for event_row in
      update public.fan_activity_events set
        is_valid = should_be_valid,
        invalidation_reason = case when should_be_valid then null
          when tg_op = 'DELETE' then 'CONTENT_DELETED' else 'MODERATION_HIDDEN' end
      where activity_type = 'COMMENT_CREATE' and source_id = old.id
      returning user_id, activity_date
    loop
      perform public.recalculate_fan_activity_day(event_row.user_id, event_row.activity_date);
    end loop;
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    should_be_valid := false;
  else
    should_be_valid := new.moderation_status = 'VISIBLE';
  end if;
  for event_row in
    update public.fan_activity_events set
      is_valid = should_be_valid,
      invalidation_reason = case when should_be_valid then null
        when tg_op = 'DELETE' then 'CONTENT_DELETED' else 'MODERATION_HIDDEN' end
    where source_id = old.id
      and activity_type in ('POST_CREATE', 'POST_READ')
    returning user_id, activity_date
  loop
    perform public.recalculate_fan_activity_day(event_row.user_id, event_row.activity_date);
  end loop;
  for event_row in
    update public.fan_activity_events event set
      is_valid = should_be_valid and exists (
        select 1 from public.post_likes like_row
        where like_row.post_id = event.source_id
          and like_row.user_id = event.actor_user_id
      ),
      invalidation_reason = case
        when should_be_valid and exists (
          select 1 from public.post_likes like_row
          where like_row.post_id = event.source_id
            and like_row.user_id = event.actor_user_id
        ) then null
        when tg_op = 'DELETE' then 'CONTENT_DELETED'
        when not should_be_valid then 'MODERATION_HIDDEN'
        else 'LIKE_REMOVED' end
    where event.activity_type = 'POST_LIKE_RECEIVED' and event.source_id = old.id
    returning user_id, activity_date
  loop
    perform public.recalculate_fan_activity_day(event_row.user_id, event_row.activity_date);
  end loop;
  for event_row in
    update public.fan_activity_events event set
      is_valid = should_be_valid and exists (
        select 1 from public.comments comment
        where comment.id = event.source_id and comment.moderation_status = 'VISIBLE'
      ),
      invalidation_reason = case
        when should_be_valid and exists (
          select 1 from public.comments comment
          where comment.id = event.source_id
            and comment.moderation_status = 'VISIBLE'
        ) then null
        when tg_op = 'DELETE' then 'CONTENT_DELETED'
        else 'MODERATION_HIDDEN' end
    where event.activity_type = 'COMMENT_CREATE' and event.parent_post_id = old.id
    returning user_id, activity_date
  loop
    perform public.recalculate_fan_activity_day(event_row.user_id, event_row.activity_date);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.claim_fan_activity_content(uuid,text,uuid,text,timestamptz),
  public.recalculate_fan_activity_day(uuid,date),
  public.record_fan_activity_event(uuid,text,uuid,uuid,uuid,smallint,boolean,boolean,text,timestamptz),
  public.capture_fan_activity_insert(), public.sync_fan_activity_validity()
  from public, anon, authenticated;

create trigger fan_activity_post_created after insert on public.posts
for each row execute function public.capture_fan_activity_insert();
create trigger fan_activity_comment_created after insert on public.comments
for each row execute function public.capture_fan_activity_insert();
create trigger fan_activity_post_viewed after insert on public.post_views
for each row execute function public.capture_fan_activity_insert();
create trigger fan_activity_like_received after insert on public.post_likes
for each row execute function public.capture_fan_activity_insert();
create trigger fan_activity_like_removed after delete on public.post_likes
for each row execute function public.sync_fan_activity_validity();
create trigger fan_activity_post_invalidated
after delete or update of moderation_status on public.posts
for each row execute function public.sync_fan_activity_validity();
create trigger fan_activity_comment_invalidated
after delete or update of moderation_status on public.comments
for each row execute function public.sync_fan_activity_validity();

create or replace function public.fan_level_for_activity(
  post_count bigint,
  attendance_count bigint
)
returns text language sql immutable set search_path = '' as $$
  -- Keep the legacy parameter names because PostgreSQL does not allow an
  -- existing function's input parameter names to change via CREATE OR
  -- REPLACE. The arguments now represent activity days and activity score.
  select case
    when coalesce(post_count, 0) >= 180 and coalesce(attendance_count, 0) >= 1200 then 'LEGEND'
    when coalesce(post_count, 0) >= 90 and coalesce(attendance_count, 0) >= 500 then 'CORE_FAN'
    when coalesce(post_count, 0) >= 30 and coalesce(attendance_count, 0) >= 150 then 'PASSIONATE_FAN'
    when coalesce(post_count, 0) >= 7 and coalesce(attendance_count, 0) >= 30 then 'SUPPORTER'
    else 'FAN'
  end;
$$;

create or replace function public.fan_level_for_user(target_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.fan_level_for_activity(
    count(distinct activity_date) filter (
      where is_valid and counts_activity_day
    ),
    coalesce(sum(awarded_points) filter (where is_valid), 0)
  ) from public.fan_activity_events where user_id = target_user_id;
$$;

revoke execute on function public.fan_level_for_activity(bigint,bigint)
  from public, anon;
grant execute on function public.fan_level_for_activity(bigint,bigint)
  to authenticated, service_role;
revoke execute on function public.fan_level_for_user(uuid) from public, anon;
grant execute on function public.fan_level_for_user(uuid)
  to anon, authenticated, service_role;

drop function public.get_community_user_profile(uuid);
create function public.get_community_user_profile(target_user_id uuid)
returns table (
  user_id uuid, nickname text, team_id text, fan_level_id text,
  post_count bigint, comment_count bigint, attendance_count bigint,
  activity_day_count bigint, activity_score bigint
)
language sql stable security definer set search_path = '' as $$
  select profile.id, profile.nickname, profile.team_id,
    public.fan_level_for_activity(activity.activity_day_count, activity.activity_score),
    (select count(*) from public.posts where author_id = profile.id),
    (select count(*) from public.comments where user_id = profile.id),
    (select count(*) from public.attendances where user_id = profile.id),
    activity.activity_day_count, activity.activity_score
  from public.profiles profile
  cross join lateral (
    select
      count(distinct event.activity_date) filter (
        where event.is_valid and event.counts_activity_day
      )::bigint as activity_day_count,
      coalesce(sum(event.awarded_points) filter (where event.is_valid), 0)::bigint
        as activity_score
    from public.fan_activity_events event where event.user_id = profile.id
  ) activity
  where profile.id = target_user_id and profile.team_id is not null
    and profile.nickname <> '' and auth.uid() is not null;
$$;
revoke all on function public.get_community_user_profile(uuid) from public, anon;
grant execute on function public.get_community_user_profile(uuid) to authenticated;

create or replace function public.increment_post_view(target_post_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; resulting_count integer; post_author_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select post.view_count, post.author_id into resulting_count, post_author_id
  from public.posts post where post.id = target_post_id and (
    post.board = 'LEAGUE' or post.team_id = (
      select profile.team_id from public.profiles profile where profile.id = auth.uid()
    )
  );
  if not found then raise exception 'POST_NOT_FOUND'; end if;
  if post_author_id = auth.uid() then return resulting_count; end if;
  insert into public.post_views(post_id,user_id,viewed_on)
  values(target_post_id,auth.uid(),(now() at time zone 'Asia/Seoul')::date)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    update public.posts set view_count = view_count + 1 where id = target_post_id
    returning view_count into resulting_count;
  end if;
  return resulting_count;
end;
$$;
revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to authenticated;

create or replace function public.enforce_community_emoticon_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare profile_team_id text; current_level text;
begin
  if new.emoticon_key is null then return new; end if;
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select team_id into profile_team_id from public.profiles where id = auth.uid();
  if split_part(new.emoticon_key, ':', 1) <> profile_team_id then
    raise exception 'INVALID_TEAM_EMOTICON';
  end if;
  current_level := public.fan_level_for_user(auth.uid());
  if current_level = 'FAN' then raise exception 'EMOTICON_REQUIRES_SUPPORTER'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_community_emoticon_access()
  from public, anon, authenticated;

-- Preserve the latest matchday and participating-team restrictions; only the
-- minimum fan level changes.
create or replace function public.send_fixture_cheer(
  target_fixture_id text, message_content text default null,
  target_emoticon_key text default null
)
returns public.fixture_cheer_messages language plpgsql security definer
set search_path = '' as $$
declare current_profile public.profiles; target_fixture public.fixtures;
  current_level text; normalized_content text;
  created_message public.fixture_cheer_messages;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into current_profile from public.profiles where id = auth.uid();
  if current_profile.team_id is null then raise exception 'TEAM_REQUIRED'; end if;
  select * into target_fixture from public.fixtures where id = target_fixture_id;
  if target_fixture.id is null or target_fixture.status = 'CANCELED'
     or (target_fixture.kickoff_at at time zone 'Asia/Seoul')::date
        <> (now() at time zone 'Asia/Seoul')::date then
    raise exception 'CHEER_TALK_NOT_MATCHDAY';
  end if;
  if current_profile.team_id not in (target_fixture.home_team_id, target_fixture.away_team_id) then
    raise exception 'CHEER_TALK_TEAM_ONLY';
  end if;
  normalized_content := nullif(trim(coalesce(message_content, '')), '');
  if normalized_content is not null and char_length(normalized_content) > 80 then
    raise exception 'CHEER_MESSAGE_TOO_LONG';
  end if;
  if normalized_content is null and target_emoticon_key is null then
    raise exception 'CHEER_MESSAGE_REQUIRED';
  end if;
  if target_emoticon_key is not null then
    if target_emoticon_key !~ '^[a-z0-9-]+:(victory|chant|love|goal|pride|believe|referee|wake-up)$'
       or split_part(target_emoticon_key, ':', 1) <> current_profile.team_id then
      raise exception 'INVALID_TEAM_EMOTICON';
    end if;
    current_level := public.fan_level_for_user(auth.uid());
    if current_level = 'FAN' then raise exception 'EMOTICON_REQUIRES_SUPPORTER'; end if;
  end if;
  if exists (select 1 from public.fixture_cheer_messages recent
    where recent.user_id = auth.uid() and recent.created_at > now() - interval '3 seconds') then
    raise exception 'CHEER_RATE_LIMITED';
  end if;
  insert into public.fixture_cheer_messages(fixture_id,user_id,team_id,content,emoticon_key)
  values(target_fixture_id,auth.uid(),current_profile.team_id,normalized_content,target_emoticon_key)
  returning * into created_message;
  return created_message;
end;
$$;
revoke all on function public.send_fixture_cheer(text,text,text) from public, anon;
grant execute on function public.send_fixture_cheer(text,text,text) to authenticated;

comment on table public.fan_activity_events is
  'Immutable-source fan-rank activity ledger with KST dates, daily caps, deduplication and reversible invalidation.';

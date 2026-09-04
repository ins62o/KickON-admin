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
  target_fixture public.fixtures;
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

  select * into target_fixture
  from public.fixtures
  where id = target_fixture_id;

  if target_fixture.id is null or target_fixture.status <> 'LIVE' then
    raise exception 'CHEER_TALK_NOT_LIVE';
  end if;

  if current_profile.team_id not in (
    target_fixture.home_team_id,
    target_fixture.away_team_id
  ) then
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

comment on function public.send_fixture_cheer(text, text, text) is
  'Sends a live fixture cheer only when the signed-in profile supports the home or away team.';

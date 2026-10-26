-- Remove a player from active squad surfaces while preserving historical
-- references and preventing the provider sync from restoring the player.

create or replace function public.admin_delete_player(
  p_player_id text,
  p_season integer,
  p_league_id text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_actor uuid := (select auth.uid());
  normalized_player_id text := trim(coalesce(p_player_id, ''));
  normalized_league_id text := trim(coalesce(p_league_id, ''));
  normalized_reason text := trim(coalesce(p_reason, ''));
  before_row jsonb;
begin
  if current_actor is null
    or not public.admin_has_capability('football.write')
  then
    raise exception 'FOOTBALL_EDITOR_REQUIRED';
  end if;

  if normalized_player_id !~ '^[A-Za-z0-9_-]{1,80}$'
    or char_length(normalized_league_id) not between 1 and 160
    or p_season is null or p_season not between 2000 and 2200
    or char_length(normalized_reason) not between 3 and 1000
  then
    raise exception 'INVALID_PLAYER_DELETE';
  end if;

  select to_jsonb(player)
  into before_row
  from public.team_players player
  where player.player_id = normalized_player_id
    and player.season = p_season
    and player.league_id = normalized_league_id
    and player.in_squad
  for update;

  if before_row is null then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  insert into public.manual_overrides (
    entity_type, entity_id, season, league_id, field_path, original_value,
    override_value, reason, blocks_sync, created_by
  ) values (
    'player', normalized_player_id, p_season, normalized_league_id,
    'in_squad', before_row -> 'in_squad', 'false'::jsonb,
    normalized_reason, true, current_actor
  )
  on conflict (entity_type, entity_id, season, league_id, field_path)
    where released_at is null
  do update set
    override_value = excluded.override_value,
    reason = excluded.reason,
    blocks_sync = true,
    updated_at = now();

  update public.team_players player
  set in_squad = false,
      updated_at = now()
  where player.player_id = normalized_player_id
    and player.season = p_season
    and player.league_id = normalized_league_id;

  perform public.data_center_write_audit(
    'PLAYER_DELETED',
    'team_player',
    normalized_player_id,
    before_row - 'image_url',
    jsonb_build_object(
      'season', p_season,
      'leagueId', normalized_league_id,
      'inSquad', false,
      'syncBlocked', true
    ),
    normalized_reason
  );

  return true;
end;
$$;

revoke all on function public.admin_delete_player(text, integer, text, text)
  from public, anon;
grant execute on function public.admin_delete_player(text, integer, text, text)
  to authenticated;

comment on function public.admin_delete_player(text, integer, text, text) is
  'Removes a player from active squad surfaces and blocks provider sync restoration while retaining historical references.';

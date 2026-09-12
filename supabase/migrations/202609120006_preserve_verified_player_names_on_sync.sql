begin;

-- SportsMonks squad and lineup upserts must not erase a verified Korean name.
-- This runs before the existing manual-override trigger, so a scoped manual
-- override still has the final say when one exists.
create or replace function public.apply_verified_player_name_on_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_name text;
begin
  if new.player_id is null or left(new.player_id, 7) = 'manual_' then
    return new;
  end if;

  select localization.name_ko
  into canonical_name
  from public.football_player_localizations localization
  where localization.provider = 'sportmonks'
    and localization.provider_player_id = new.player_id
    and localization.is_verified
    and nullif(trim(localization.name_ko), '') is not null;

  if canonical_name is not null then
    new.display_name_ko := canonical_name;
  end if;

  return new;
end;
$$;

revoke all on function public.apply_verified_player_name_on_sync()
  from public, anon, authenticated;

drop trigger if exists team_players_apply_verified_localization
  on public.team_players;
create trigger team_players_apply_verified_localization
  before insert or update on public.team_players
  for each row execute function public.apply_verified_player_name_on_sync();

drop trigger if exists fixture_lineup_players_apply_verified_localization
  on public.fixture_lineup_players;
create trigger fixture_lineup_players_apply_verified_localization
  before insert or update on public.fixture_lineup_players
  for each row execute function public.apply_verified_player_name_on_sync();

-- Repair names that a previous provider sync cleared.
update public.team_players as player
set display_name_ko = localization.name_ko,
    updated_at = now()
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = player.player_id
  and localization.is_verified
  and nullif(trim(localization.name_ko), '') is not null
  and player.display_name_ko is distinct from localization.name_ko;

update public.fixture_lineup_players as lineup_player
set display_name_ko = localization.name_ko
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = lineup_player.player_id
  and localization.is_verified
  and nullif(trim(localization.name_ko), '') is not null
  and lineup_player.display_name_ko is distinct from localization.name_ko;

commit;

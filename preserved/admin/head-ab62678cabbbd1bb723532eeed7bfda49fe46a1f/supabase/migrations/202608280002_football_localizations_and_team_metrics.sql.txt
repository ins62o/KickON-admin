create table if not exists public.football_player_localizations (
  provider text not null default 'sportmonks',
  provider_player_id text not null,
  name_en text not null,
  name_ko text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, provider_player_id)
);

alter table public.football_player_localizations enable row level security;

drop policy if exists "authenticated users read football player localizations"
  on public.football_player_localizations;
create policy "authenticated users read football player localizations"
  on public.football_player_localizations
  for select
  to authenticated
  using (true);

grant select on public.football_player_localizations to authenticated;

create or replace function public.apply_football_player_localization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider <> 'sportmonks' then
    return new;
  end if;

  update public.team_players
  set display_name = new.name_en,
      display_name_ko = new.name_ko,
      updated_at = now()
  where player_id = new.provider_player_id;

  update public.fixture_lineup_players
  set player_name = new.name_en,
      display_name_ko = new.name_ko
  where player_id = new.provider_player_id;

  return new;
end;
$$;

drop trigger if exists apply_football_player_localization_trigger
  on public.football_player_localizations;
create trigger apply_football_player_localization_trigger
after insert or update of name_en, name_ko
on public.football_player_localizations
for each row execute function public.apply_football_player_localization();

insert into public.football_player_localizations (
  provider,
  provider_player_id,
  name_en,
  name_ko,
  is_verified,
  updated_at
)
select
  'sportmonks',
  player_id,
  coalesce(nullif(display_name, ''), player_name),
  display_name_ko,
  display_name_ko is not null,
  now()
from public.team_players
where season = 2026
  and league_id = 'kleague'
on conflict (provider, provider_player_id) do update
set name_en = excluded.name_en,
    name_ko = coalesce(
      public.football_player_localizations.name_ko,
      excluded.name_ko
    ),
    is_verified = public.football_player_localizations.is_verified
      or excluded.is_verified,
    updated_at = now();

update public.football_player_localizations as localization
set name_ko = names.name_ko,
    is_verified = true,
    updated_at = now()
from (
  values
    ('321257', '정원진'),
    ('37623452', '박호민'),
    ('37735557', '백민규'),
    ('37918802', '이상현'),
    ('12126934', '정태욱'),
    ('37499625', '강영훈'),
    ('787504', '이상기'),
    ('751156', '문지환'),
    ('37624628', '여승원'),
    ('12844068', '오후성'),
    ('1452543', '정치인'),
    ('322907', '김연수'),
    ('160077', '레안드로'),
    ('189184', '이케르'),
    ('320976', '이태희'),
    ('37677365', '박승호'),
    ('159119', '제르소'),
    ('37627499', '김성민'),
    ('37677358', '김건희'),
    ('37342726', '서재민'),
    ('320839', '이주용'),
    ('37918803', '박경섭'),
    ('37735554', '최승구'),
    ('316', '이청용'),
    ('15662', '모건'),
    ('307696', '이명주'),
    ('448352', '후안 이비자'),
    ('31626461', '이동률'),
    ('37739133', '김영환'),
    ('29311996', '김동헌'),
    ('34690', '무고사'),
    ('37581707', '김명순')
) as names(provider_player_id, name_ko)
where localization.provider = 'sportmonks'
  and localization.provider_player_id = names.provider_player_id;

insert into public.football_player_localizations (
  provider,
  provider_player_id,
  name_en,
  name_ko,
  is_verified,
  updated_at
)
select
  'sportmonks',
  player_id,
  coalesce(nullif(display_name, ''), player_name),
  '이민혁',
  true,
  now()
from public.team_players
where season = 2026
  and league_id = 'kleague'
  and team_id = 'incheon'
  and lower(
    regexp_replace(coalesce(display_name, player_name), '[^a-z]', '', 'g')
  ) in ('minhyuklee', 'leeminhyuk')
on conflict (provider, provider_player_id) do update
set name_en = excluded.name_en,
    name_ko = excluded.name_ko,
    is_verified = true,
    updated_at = now();

update public.team_players as player
set display_name_ko = localization.name_ko,
    updated_at = now()
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = player.player_id
  and localization.name_ko is not null;

update public.fixture_lineup_players as lineup_player
set display_name_ko = localization.name_ko
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = lineup_player.player_id
  and localization.name_ko is not null;

create or replace view public.football_player_translation_queue
with (security_invoker = true)
as
select
  player.team_id,
  team.name as team_name,
  player.player_id as provider_player_id,
  localization.name_en,
  localization.name_ko,
  localization.is_verified,
  player.shirt_number,
  player.position,
  player.in_squad
from public.team_players as player
join public.teams as team on team.id = player.team_id
join public.football_player_localizations as localization
  on localization.provider = 'sportmonks'
 and localization.provider_player_id = player.player_id
where player.season = 2026
  and player.league_id = 'kleague';

grant select on public.football_player_translation_queue to authenticated;

alter table public.stadiums
  add column if not exists name_en text,
  add column if not exists name_ko text,
  add column if not exists address_en text,
  add column if not exists address_ko text;

update public.stadiums
set name_en = coalesce(
      name_en,
      case when name !~ '[가-힣]' then name end
    ),
    name_ko = coalesce(
      name_ko,
      case when name ~ '[가-힣]' then name end
    ),
    address_en = coalesce(
      address_en,
      case when address !~ '[가-힣]' then address end
    ),
    address_ko = coalesce(
      address_ko,
      case when address ~ '[가-힣]' then address end
    );

update public.stadiums as stadium
set name_en = localized.name_en,
    name_ko = localized.name_ko,
    name = localized.name_ko,
    address_ko = localized.address_ko,
    address = coalesce(localized.address_ko, stadium.address)
from (
  values
    (
      'incheon-football-stadium',
      'Incheon Football Stadium',
      '인천축구전용경기장',
      '인천광역시 중구 참외전로 246'
    ),
    (
      'seoul-world-cup-stadium',
      'Seoul World Cup Stadium',
      '서울월드컵경기장',
      '서울특별시 마포구 월드컵로 240'
    ),
    (
      'jeonju-world-cup-stadium',
      'Jeonju World Cup Stadium',
      '전주월드컵경기장',
      '전북특별자치도 전주시 덕진구 기린대로 1055'
    )
) as localized(stadium_id, name_en, name_ko, address_ko)
where stadium.id = localized.stadium_id;

update public.stadiums as stadium
set name_en = localized.name_en,
    name_ko = localized.name_ko,
    name = localized.name_ko
from (
  values
    ('ulsanmensufootballstadium', 'Ulsan Munsu Football Stadium', '울산문수축구경기장'),
    ('ulsanmunsufootballstadium', 'Ulsan Munsu Football Stadium', '울산문수축구경기장'),
    ('daejeonworldcupstadium', 'Daejeon World Cup Stadium', '대전월드컵경기장'),
    ('pohangsteelyard', 'Pohang Steel Yard', '포항스틸야드'),
    ('steelyardstadium', 'Pohang Steel Yard', '포항스틸야드'),
    ('anyangstadium', 'Anyang Stadium', '안양종합운동장'),
    ('bucheonstadium', 'Bucheon Stadium', '부천종합운동장'),
    ('gangneunghigh1arena', 'Gangneung High1 Arena', '강릉하이원아레나'),
    ('gangneungstadium', 'Gangneung High1 Arena', '강릉하이원아레나'),
    ('jejoworldcupstadium', 'Jeju World Cup Stadium', '제주월드컵경기장'),
    ('gwangjufootballstadium', 'Gwangju Football Stadium', '광주축구전용구장'),
    ('gimcheonstadium', 'Gimcheon Stadium', '김천종합운동장')
) as localized(normalized_name, name_en, name_ko)
where lower(
  regexp_replace(coalesce(stadium.name_en, stadium.name), '[^a-z]', '', 'g')
) = localized.normalized_name;

alter table public.league_standings
  add column if not exists clean_sheets integer not null default 0
    check (clean_sheets >= 0),
  add column if not exists average_possession numeric(5, 2);

alter table public.league_standings
  drop constraint if exists league_standings_average_possession_check;
alter table public.league_standings
  add constraint league_standings_average_possession_check
  check (
    average_possession is null
    or (average_possession >= 0 and average_possession <= 100)
  );

create table if not exists public.fixture_lineup_sync_state (
  fixture_id text primary key references public.fixtures(id) on delete cascade,
  last_attempted_at timestamptz not null default now(),
  last_succeeded_at timestamptz,
  provider_has_lineup boolean not null default false,
  last_error text
);

alter table public.fixture_lineup_sync_state enable row level security;

drop policy if exists "authenticated users read fixture lineup sync state"
  on public.fixture_lineup_sync_state;
create policy "authenticated users read fixture lineup sync state"
  on public.fixture_lineup_sync_state
  for select
  to authenticated
  using (true);

grant select on public.fixture_lineup_sync_state to authenticated;

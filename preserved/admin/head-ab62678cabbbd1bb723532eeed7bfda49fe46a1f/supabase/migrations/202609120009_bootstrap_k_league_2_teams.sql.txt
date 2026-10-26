begin;

-- The full SportsMonks sync deliberately maps provider identities onto our
-- stable team IDs. Seed every 2026 K League 2 club before the first production
-- sync so provider data cannot create a second identity for the same club.
insert into public.teams (id, name, short_name, code, sportmonks_id) values
  ('ansan-greeners', '안산 그리너스', '안산', 'ANS', 6201),
  ('busan-ipark', '부산 아이파크', '부산', 'BUS', 2690),
  ('cheonan-city', '천안시티 FC', '천안', 'CHN', 17818),
  ('chungbuk-cheongju', '충북청주 FC', '충북청주', 'CBJ', 18334),
  ('chungnam-asan', '충남 아산 FC', '충남아산', 'ASA', 17812),
  ('daegu', '대구 FC', '대구', 'DGU', 6954),
  ('gimhae', '김해 FC', '김해', 'GMH', 7389),
  ('gimpo', '김포 FC', '김포', 'GMP', 18351),
  ('gyeongnam', '경남 FC', '경남', 'GNF', 7983),
  ('hwaseong', '화성 FC', '화성', 'HWS', 18294),
  ('jeonnam', '전남 드래곤즈', '전남', 'JND', 7971),
  ('paju', '파주 프론티어', '파주', 'PAJ', 18344),
  ('seongnam', '성남 FC', '성남', 'SNM', 3605),
  ('seoul-eland', '서울 이랜드 FC', '서울E', 'SEL', 14732),
  ('suwon-bluewings', '수원 삼성 블루윙즈', '수원삼성', 'SSB', 2366),
  ('suwon-fc', '수원 FC', '수원FC', 'SFC', 904),
  ('yongin', '용인 FC', '용인', 'YON', 18123)
on conflict (id) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  code = excluded.code,
  sportmonks_id = excluded.sportmonks_id;

insert into public.football_provider_seasons (
  provider,
  provider_league_id,
  provider_season_id,
  season_name,
  finished,
  pending,
  is_current
) values (
  'sportmonks',
  1362,
  27443,
  '2026',
  false,
  false,
  true
)
on conflict (provider, provider_season_id) do update set
  provider_league_id = excluded.provider_league_id,
  season_name = excluded.season_name,
  finished = excluded.finished,
  pending = excluded.pending,
  is_current = excluded.is_current;

commit;

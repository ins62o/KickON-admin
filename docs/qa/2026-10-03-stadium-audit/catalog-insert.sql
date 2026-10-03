-- Production-only catalogue entry. No fixture, team or existing stadium is updated.
-- Address: https://www.suncheon.go.kr/yeyak/training/intro
-- Main athletics pitch: https://www.openstreetmap.org/way/480425370
-- Centre derived from main pitch bounds, excluding auxiliary pitch and baseball ground.
begin;
do $$ begin
  if not exists (select 1 from public.fixtures where id='sportmonks-19676305' and home_team_id='jeonnam' and away_team_id='daegu' and kickoff_at='2026-10-24T05:00:00Z' and stadium_id='sportmonks-venue-5186') then
    raise exception 'TARGET_FIXTURE_CHANGED_RECHECK_REQUIRED';
  end if;
  if exists (select 1 from public.stadiums where id='suncheon-palma-stadium' or concat(name,' ',name_ko,' ',name_en) ~* 'palma|suncheon|순천|팔마') then
    raise exception 'PALMA_ALREADY_EXISTS_RECHECK_REQUIRED';
  end if;
end $$;
insert into public.stadiums(id,name,name_ko,name_en,address,address_ko,address_en,latitude,longitude)
values('suncheon-palma-stadium','순천팔마종합운동장','순천팔마종합운동장','Suncheon Palma Stadium','전라남도 순천시 팔마로 333','전라남도 순천시 팔마로 333','333 Palma-ro, Suncheon-si, Jeollanam-do, South Korea',34.9383274,127.5194672)
returning id,name,name_ko,name_en,address,latitude,longitude;
commit;

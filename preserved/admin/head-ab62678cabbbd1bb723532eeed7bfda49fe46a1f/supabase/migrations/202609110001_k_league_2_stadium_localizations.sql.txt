-- Canonical 2026 K League 2 home grounds. The K League schedule is the source
-- of truth for the home-ground assignment; coordinates are the main pitch
-- centres used by GPS attendance rather than provider city-centre coordinates.
insert into public.stadiums (
  id,
  name,
  name_en,
  name_ko,
  latitude,
  longitude,
  address,
  address_en,
  address_ko,
  sportmonks_id
) values
  ('sportmonks-venue-14052', '안산 와~스타디움', 'Ansan Wa Stadium', '안산 와~스타디움', 37.3193957, 126.8186467, '경기도 안산시 단원구 화랑로 260', '260 Hwarang-ro, Danwon-gu, Ansan-si, Gyeonggi-do', '경기도 안산시 단원구 화랑로 260', 14052),
  ('sportmonks-venue-2678', '부산 구덕운동장', 'Busan Gudeok Stadium', '부산 구덕운동장', 35.1165225, 129.01449, '부산광역시 서구 망양로 57', '57 Mangyang-ro, Seo-gu, Busan', '부산광역시 서구 망양로 57', 2678),
  ('sportmonks-venue-14080', '천안종합운동장', 'Cheonan Stadium', '천안종합운동장', 36.8187472, 127.1151474, '충청남도 천안시 서북구 번영로 208', '208 Beonyeong-ro, Seobuk-gu, Cheonan-si, Chungcheongnam-do', '충청남도 천안시 서북구 번영로 208', 14080),
  ('sportmonks-venue-14117', '청주종합경기장', 'Cheongju Stadium', '청주종합경기장', 36.6378917, 127.4723813, '충청북도 청주시 서원구 사직대로 229', '229 Sajik-daero, Seowon-gu, Cheongju-si, Chungcheongbuk-do', '충청북도 청주시 서원구 사직대로 229', 14117),
  ('sportmonks-venue-14115', '이순신종합운동장', 'Yi Sun-sin Stadium', '이순신종합운동장', 36.7681989, 127.0216292, '충청남도 아산시 남부로 370-24', '370-24 Nambu-ro, Asan-si, Chungcheongnam-do', '충청남도 아산시 남부로 370-24', 14115),
  ('sportmonks-venue-320604', '대구iM뱅크PARK', 'Daegu iM Bank PARK', '대구iM뱅크PARK', 35.8812967, 128.5879941, '대구광역시 북구 고성로 191', '191 Goseong-ro, Buk-gu, Daegu', '대구광역시 북구 고성로 191', 320604),
  ('sportmonks-venue-4787', '김해종합운동장', 'Gimhae Stadium', '김해종합운동장', 35.2576238, 128.8753665, '경상남도 김해시 구지로 50', '50 Guji-ro, Gimhae-si, Gyeongsangnam-do', '경상남도 김해시 구지로 50', 4787),
  ('sportmonks-venue-14093', '김포솔터축구장', 'Gimpo Solteo Football Field', '김포솔터축구장', 37.6408155, 126.6500187, '경기도 김포시 김포한강3로 385', '385 Gimpohangang 3-ro, Gimpo-si, Gyeonggi-do', '경기도 김포시 김포한강3로 385', 14093),
  ('sportmonks-venue-5190', '창원축구센터', 'Changwon Football Center', '창원축구센터', 35.2226675, 128.7060856, '경상남도 창원시 성산구 비음로 97', '97 Bieum-ro, Seongsan-gu, Changwon-si, Gyeongsangnam-do', '경상남도 창원시 성산구 비음로 97', 5190),
  ('hwaseong-sports-town', '화성종합경기타운', 'Hwaseong Sports Town', '화성종합경기타운', 37.1372825, 126.924715, '경기도 화성시 향남읍 향남로 470', '470 Hyangnam-ro, Hyangnam-eup, Hwaseong-si, Gyeonggi-do', '경기도 화성시 향남읍 향남로 470', null),
  ('sportmonks-venue-5186', '광양축구전용구장', 'Gwangyang Football Stadium', '광양축구전용구장', 34.9330583, 127.7274262, '전라남도 광양시 백운로 1641', '1641 Baegun-ro, Gwangyang-si, Jeollanam-do', '전라남도 광양시 백운로 1641', 5186),
  ('sportmonks-venue-14120', '파주스타디움', 'Paju Stadium', '파주스타디움', 37.7561209, 126.7865965, '경기도 파주시 중앙로 160', '160 Jungang-ro, Paju-si, Gyeonggi-do', '경기도 파주시 중앙로 160', 14120),
  ('sportmonks-venue-2112', '탄천종합운동장', 'Tancheon Stadium', '탄천종합운동장', 37.4101669, 127.1211863, '경기도 성남시 분당구 탄천로 215', '215 Tancheon-ro, Bundang-gu, Seongnam-si, Gyeonggi-do', '경기도 성남시 분당구 탄천로 215', 2112),
  ('sportmonks-venue-343344', '목동종합운동장', 'Mokdong Stadium', '목동종합운동장', 37.5305043, 126.8830581, '서울특별시 양천구 안양천로 939', '939 Anyangcheon-ro, Yangcheon-gu, Seoul', '서울특별시 양천구 안양천로 939', 343344),
  ('sportmonks-venue-324', '수원월드컵경기장', 'Suwon World Cup Stadium', '수원월드컵경기장', 37.2863794, 127.0367951, '경기도 수원시 팔달구 월드컵로 310', '310 World Cup-ro, Paldal-gu, Suwon-si, Gyeonggi-do', '경기도 수원시 팔달구 월드컵로 310', 324),
  ('sportmonks-venue-14076', '수원종합운동장', 'Suwon Stadium', '수원종합운동장', 37.2977947, 127.0113949, '경기도 수원시 장안구 경수대로 893', '893 Gyeongsu-daero, Jangan-gu, Suwon-si, Gyeonggi-do', '경기도 수원시 장안구 경수대로 893', 14076),
  ('yongin-mireu-stadium', '용인미르스타디움', 'Yongin Mireu Stadium', '용인미르스타디움', 37.2496378, 127.16547, '경기도 용인시 처인구 동백죽전대로 61', '61 Dongbaekjukjeon-daero, Cheoin-gu, Yongin-si, Gyeonggi-do', '경기도 용인시 처인구 동백죽전대로 61', null)
on conflict (id) do update set
  name = excluded.name,
  name_en = excluded.name_en,
  name_ko = excluded.name_ko,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  address = excluded.address,
  address_en = excluded.address_en,
  address_ko = excluded.address_ko,
  sportmonks_id = excluded.sportmonks_id;

-- Provider venue assignments for several 2026 fixtures point to training or
-- auxiliary grounds. Keep manual operator overrides intact through the
-- existing protection trigger while correcting normal rows by home club.
update public.fixtures as fixture
set stadium_id = home_ground.stadium_id,
    updated_at = now()
from (values
  ('ansan-greeners', 'sportmonks-venue-14052'),
  ('busan-ipark', 'sportmonks-venue-2678'),
  ('cheonan-city', 'sportmonks-venue-14080'),
  ('chungbuk-cheongju', 'sportmonks-venue-14117'),
  ('chungnam-asan', 'sportmonks-venue-14115'),
  ('daegu', 'sportmonks-venue-320604'),
  ('gimhae', 'sportmonks-venue-4787'),
  ('gimpo', 'sportmonks-venue-14093'),
  ('gyeongnam', 'sportmonks-venue-5190'),
  ('hwaseong', 'hwaseong-sports-town'),
  ('jeonnam', 'sportmonks-venue-5186'),
  ('paju', 'sportmonks-venue-14120'),
  ('seongnam', 'sportmonks-venue-2112'),
  ('seoul-eland', 'sportmonks-venue-343344'),
  ('suwon-bluewings', 'sportmonks-venue-324'),
  ('suwon-fc', 'sportmonks-venue-14076'),
  ('yongin', 'yongin-mireu-stadium')
) as home_ground(team_id, stadium_id)
where fixture.league_id = 'kleague2'
  and fixture.kickoff_at >= timestamptz '2026-01-01 00:00:00+00'
  and fixture.kickoff_at < timestamptz '2027-01-01 00:00:00+00'
  and fixture.home_team_id = home_ground.team_id;

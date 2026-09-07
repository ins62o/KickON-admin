-- Keep the provider's original English values while presenting every known
-- Korean stadium in Korean. The application prefers the *_ko columns, so a
-- later provider sync cannot replace the localized display value.
update public.stadiums as stadium
set name_en = coalesce(stadium.name_en, stadium.name),
    address_en = coalesce(stadium.address_en, stadium.address),
    name_ko = localized.name_ko,
    address_ko = localized.address_ko,
    name = localized.name_ko,
    address = localized.address_ko
from (
  values
    ('sportmonks-venue-320604', 'DGB대구은행파크', '대구광역시 북구 고성로 191'),
    ('api-venue-1007', 'DGB대구은행파크', '대구광역시 북구 고성로 191'),
    ('sportmonks-venue-14076', '수원종합운동장', '경기도 수원시 장안구 경수대로 893'),
    ('sportmonks-venue-338695', '수원종합운동장 보조경기장', '경기도 수원시 장안구 경수대로 893'),
    ('sportmonks-venue-340384', '수원종합운동장', '경기도 수원시 장안구 경수대로 893'),
    ('api-venue-5166', '강릉종합운동장', '강원특별자치도 강릉시 종합운동장길 69'),
    ('api-venue-10498', '광주축구전용구장', '광주광역시 서구 금화로 240'),
    ('api-venue-19551', '김천종합운동장', '경상북도 김천시 운동장길 1'),
    ('api-venue-1008', '대전월드컵경기장', '대전광역시 유성구 월드컵대로 32'),
    ('api-venue-19536', '목동종합운동장', '서울특별시 양천구 안양천로 939'),
    ('api-venue-1019', '수원종합운동장', '경기도 수원시 장안구 경수대로 893'),
    ('api-venue-1020', '울산문수축구경기장', '울산광역시 남구 문수로 44'),
    ('api-venue-2841', '이순신종합운동장', '충청남도 아산시 남부로 370-24'),
    ('api-venue-1014', '제주월드컵경기장', '제주특별자치도 서귀포시 월드컵로 33'),
    ('api-venue-11502', '천안종합운동장', '충청남도 천안시 서북구 번영로 208'),
    ('api-venue-1009', '춘천송암스포츠타운 주경기장', '강원특별자치도 춘천시 스포츠타운길 136'),
    ('api-venue-1016', '포항스틸야드', '경상북도 포항시 남구 동해안로6213번길 20')
) as localized(stadium_id, name_ko, address_ko)
where stadium.id = localized.stadium_id;

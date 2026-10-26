update public.stadiums as stadium
set name_en = localized.name_en,
    name_ko = localized.name_ko,
    name = localized.name_ko,
    address_ko = localized.address_ko,
    address = localized.address_ko
from (
  values
    (175, 'Seoul World Cup Stadium', '서울월드컵경기장', '서울특별시 마포구 월드컵로 240'),
    (709, 'Steelyard Stadium', '포항스틸야드', '경상북도 포항시 남구 동해안로6213번길 20'),
    (1957, 'Jeonju World Cup Stadium', '전주월드컵경기장', '전북특별자치도 전주시 덕진구 기린대로 1055'),
    (2288, 'Sangju Stadium', '상주시민운동장', '경상북도 상주시 북상주로 24-7'),
    (3718, 'Daejeon World Cup Stadium', '대전월드컵경기장', '대전광역시 유성구 월드컵대로 32'),
    (4526, 'Incheon Football Stadium', '인천축구전용경기장', '인천광역시 중구 참외전로 246'),
    (4772, 'Bucheon Stadium', '부천종합운동장', '경기도 부천시 원미구 소사로 482'),
    (5222, 'Anyang Stadium', '안양종합운동장', '경기도 안양시 동안구 평촌대로 389'),
    (5224, 'Jeju World Cup Stadium', '제주월드컵경기장', '제주특별자치도 서귀포시 월드컵로 33'),
    (14088, 'Gangnam Soccer Park', '강남축구공원', '강원특별자치도 강릉시 노암동 산35'),
    (14112, 'Chuncheon Songam Stadium', '춘천송암스포츠타운 주경기장', '강원특별자치도 춘천시 스포츠타운길 136'),
    (27065, 'Ulsan Munsu Football Stadium', '울산문수축구경기장', '울산광역시 남구 문수로 44'),
    (33528, 'Gwangju World Cup Stadium', '광주월드컵경기장', '광주광역시 서구 금화로 240'),
    (71560, 'Gimcheon Stadium', '김천종합운동장', '경상북도 김천시 운동장길 1')
) as localized(sportmonks_id, name_en, name_ko, address_ko)
where stadium.sportmonks_id = localized.sportmonks_id;

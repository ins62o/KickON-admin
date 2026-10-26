update public.stadiums as stadium
set
  name = localized.name_ko,
  name_ko = localized.name_ko
from (
  values
    ('api-venue-1009', '춘천송암스포츠타운 주경기장'),
    ('api-venue-5166', '강릉종합운동장'),
    ('api-venue-1007', 'DGB대구은행파크'),
    ('api-venue-19536', '목동종합운동장'),
    ('api-venue-1008', '대전월드컵경기장'),
    ('api-venue-2841', '이순신종합운동장'),
    ('api-venue-1019', '수원종합운동장'),
    ('api-venue-10498', '광주축구전용구장'),
    ('api-venue-1014', '제주월드컵경기장'),
    ('api-venue-1016', '포항스틸야드'),
    ('api-venue-1020', '울산문수축구경기장'),
    ('api-venue-19551', '김천종합운동장'),
    ('api-venue-11502', '천안종합운동장')
) as localized(stadium_id, name_ko)
where stadium.id = localized.stadium_id;

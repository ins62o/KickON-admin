update public.stadiums as stadium
set name = localized.korean_name,
    address = coalesce(localized.korean_address, stadium.address)
from (
  values
    (
      'incheon-football-stadium',
      '인천축구전용경기장',
      '인천광역시 중구 참외전로 246'
    ),
    (
      'seoul-world-cup-stadium',
      '서울월드컵경기장',
      '서울특별시 마포구 월드컵로 240'
    ),
    (
      'jeonju-world-cup-stadium',
      '전주월드컵경기장',
      '전북특별자치도 전주시 덕진구 기린대로 1055'
    )
) as localized(stadium_id, korean_name, korean_address)
where stadium.id = localized.stadium_id;

update public.team_players as player
set display_name_ko = names.korean_name,
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
) as names(player_id, korean_name)
where player.player_id = names.player_id
  and player.season = 2026
  and player.league_id = 'kleague'
  and player.team_id = 'incheon';

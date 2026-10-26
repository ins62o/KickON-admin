-- Complete verified 2026 K League player metadata that was missing after sync.
--
-- Korean names come from the previously reviewed K League 1 localization set,
-- plus ten players verified against the current official club/K League rosters.
-- Shirt numbers were checked on 2026-09-12 against official club roster pages
-- and the K League's current club rosters. Only matching season/league/team rows
-- are updated so a number from a player's new club cannot leak into an old row.

with verified_names(provider_player_id, name_ko) as (
  values
    ('37686531', '최규현'),
    ('312999', '윤빛가람'),
    ('162227', '여봉훈'),
    ('322066', '김찬영'),
    ('38201653', '이충현'),
    ('38210982', '어담'),
    ('320865', '백동규'),
    ('37739822', '김동현'),
    ('37561618', '이의형'),
    ('765821', '갈레고'),
    ('37436303', '구스타보'),
    ('24444975', '정호진'),
    ('37679583', '김현엽'),
    ('323657', '김형근'),
    ('37679057', '이재원'),
    ('29723387', '신재원'),
    ('37562573', '강재우'),
    ('404522', '몬타뇨'),
    ('320037', '한지호'),
    ('37627629', '김종민'),
    ('321255', '김종우'),
    ('5666591', '카즈'),
    ('37627561', '김규민'),
    ('37420402', '김민준'),
    ('608331', '패트릭'),
    ('401610', '바사니'),
    ('37678044', '이상혁'),
    ('31616632', '김상준'),
    ('321214', '조성준'),
    ('37522681', '김승빈'),
    ('37343988', '유승현'),
    ('37914660', '성신'),
    ('37342716', '홍성욱'),
    ('323795', '안태현'),
    ('37410538', '티아깅요'),
    ('11298634', '가브리엘'),
    ('781636', '최원철'),
    ('37725366', '이예찬'),
    ('38219095', '성예건'),
    ('57178', '안톤'),
    ('5641042', '밥신'),
    ('37563553', '김봉수'),
    ('37769207', '박병찬'),
    ('320714', '이창근'),
    ('787558', '하창래'),
    ('37420338', '디오고'),
    ('37769217', '김도연'),
    ('2158153', '루빅손'),
    ('465972', '김현욱'),
    ('323749', '정재희'),
    ('309758', '오재석'),
    ('31626460', '서진수'),
    ('787517', '김진야'),
    ('22889458', '주앙 빅토르'),
    ('320475', '임종은'),
    ('751344', '김준범'),
    ('82041', '유강현'),
    ('319123', '마사'),
    ('29763091', '김민덕'),
    ('323785', '주민규'),
    ('37740721', '김민수'),
    ('608280', '김문환'),
    ('310020', '이명재'),
    ('787535', '이순민'),
    ('37677529', '조성권'),
    ('24444976', '엄원상'),
    ('323696', '강윤성'),
    ('37562306', '전병관'),
    ('37493607', '이찬욱'),
    ('37624626', '박철우'),
    ('31626458', '임덕근'),
    ('37476479', '이건희'),
    ('37620499', '문현호'),
    ('21054112', '김현우'),
    ('37473345', '김인균'),
    ('37739258', '윤재석'),
    ('37685269', '정재민'),
    ('37562179', '박진성'),
    ('29723375', '백종범'),
    ('37677461', '김주찬'),
    ('37757978', '강주혁'),
    ('460485', '안준수'),
    ('37563509', '이정택'),
    ('37620500', '강민규'),
    ('37493565', '이강현'),
    ('37571396', '김이석'),
    ('37620390', '민경현'),
    ('37563531', '노경호'),
    ('37584246', '이찬욱'),
    ('37739854', '정마호'),
    ('37916713', '박만호'),
    ('29771311', '박민서'),
    ('37735267', '박상영'),
    ('37677369', '박세진'),
    ('37480878', '홍시후'),
    ('31626879', '이수빈'),
    ('13186164', '박태준'),
    ('37627508', '박용희'),
    ('85980', '바 루아'),
    ('323669', '신창무'),
    ('37757699', '김동화'),
    ('84373', '프리드욘슨'),
    ('37735948', '안혁주'),
    ('37622842', '유제호'),
    ('37677530', '정지훈'),
    ('1524922', '아이데일'),
    ('320840', '김경민'),
    ('35042', '최경록'),
    ('309936', '리영직'),
    ('787552', '박원재'),
    ('320715', '주세종'),
    ('31626880', '하승운'),
    ('37437755', '권성윤'),
    ('21772891', '반 흐룬스벤'),
    ('38220208', '김우진'),
    ('38210884', '김용혁'),
    ('37917503', '최병욱'),
    ('12121065', '박창준'),
    ('320926', '이창민'),
    ('321201', '김동준'),
    ('37564192', '네게바'),
    ('37735580', '조인정'),
    ('310907', '유인수'),
    ('37554397', '이탈로'),
    ('37438683', '허자웅'),
    ('54935', '김재우'),
    ('449168', '아이아스'),
    ('37420387', '장민규'),
    ('38210564', '박민재'),
    ('37342717', '김륜성'),
    ('37621115', '김신진'),
    ('73535', '정운'),
    ('169812', '김인성'),
    ('13224560', '원기종'),
    ('37627544', '권석주'),
    ('37739813', '강성윤'),
    ('38221837', '최지남'),
    ('38224416', '이정현'),
    ('38224417', '고은석'),
    ('38224421', '여준엽'),
    ('38224422', '김태혁'),
    ('38224423', '김어진'),
    ('38224425', '김슬기'),
    ('38224541', '김민준')
), localized_players as (
  select distinct on (player.player_id)
    player.player_id,
    coalesce(nullif(player.display_name, ''), nullif(player.player_name, ''), player.player_id) as name_en,
    verified_names.name_ko
  from public.team_players as player
  join verified_names on verified_names.provider_player_id = player.player_id
  where player.season = 2026
    and player.league_id in ('kleague', 'kleague2')
  order by player.player_id, player.league_id, player.team_id
)
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
  name_en,
  name_ko,
  true,
  now()
from localized_players
on conflict (provider, provider_player_id) do update
set name_ko = case
      when public.football_player_localizations.is_verified
        and public.football_player_localizations.name_ko is not null
        then public.football_player_localizations.name_ko
      else excluded.name_ko
    end,
    is_verified = true,
    updated_at = now();

update public.team_players as player
set display_name_ko = localization.name_ko,
    updated_at = now()
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = player.player_id
  and localization.name_ko is not null
  and player.season = 2026
  and player.league_id in ('kleague', 'kleague2')
  and player.display_name_ko is null;

update public.fixture_lineup_players as lineup_player
set display_name_ko = localization.name_ko
from public.football_player_localizations as localization
where localization.provider = 'sportmonks'
  and localization.provider_player_id = lineup_player.player_id
  and localization.name_ko is not null
  and lineup_player.display_name_ko is null;

with verified_shirt_numbers(league_id, team_id, player_id, shirt_number) as (
  values
    ('kleague', 'anyang', '37620363', 66),
    ('kleague', 'daejeon', '37685045', 29),
    ('kleague', 'daejeon', '38214322', 28),
    ('kleague', 'daejeon', '38214341', 37),
    ('kleague', 'gangwon', '37627544', 37),
    ('kleague', 'gangwon', '37739813', 71),
    ('kleague', 'gangwon', '38221837', 74),
    ('kleague', 'gangwon', '38224416', 45),
    ('kleague', 'gangwon', '38224417', 38),
    ('kleague', 'gangwon', '38224421', 30),
    ('kleague', 'gangwon', '38224422', 42),
    ('kleague', 'gangwon', '38224423', 46),
    ('kleague', 'gangwon', '38224425', 61),
    ('kleague', 'jeonbuk', '38214318', 63),
    ('kleague', 'jeonbuk', '38217051', 26),
    ('kleague', 'jeonbuk', '38217052', 42),
    ('kleague', 'jeonbuk', '38217054', 80),
    ('kleague', 'jeonbuk', '38217055', 91),
    ('kleague', 'jeonbuk', '38217057', 98),
    ('kleague', 'jeonbuk', '38218298', 44),
    ('kleague', 'seoul', '37926838', 47),
    ('kleague', 'ulsan', '37916797', 3),
    ('kleague2', 'ansan-greeners', '37736114', 23),
    ('kleague2', 'ansan-greeners', '38211289', 66),
    ('kleague2', 'ansan-greeners', '38211290', 87),
    ('kleague2', 'ansan-greeners', '38211291', 11),
    ('kleague2', 'ansan-greeners', '38211292', 30),
    ('kleague2', 'busan-ipark', '38211293', 70),
    ('kleague2', 'busan-ipark', '38211296', 42),
    ('kleague2', 'busan-ipark', '38211297', 72),
    ('kleague2', 'busan-ipark', '750497', 77),
    ('kleague2', 'cheonan-city', '37472141', 2),
    ('kleague2', 'cheonan-city', '38211061', 13),
    ('kleague2', 'chungbuk-cheongju', '38217056', 10),
    ('kleague2', 'chungnam-asan', '29313821', 4),
    ('kleague2', 'chungnam-asan', '37739110', 37),
    ('kleague2', 'chungnam-asan', '37919007', 15),
    ('kleague2', 'daegu', '37677372', 4),
    ('kleague2', 'daegu', '37769204', 51),
    ('kleague2', 'daegu', '38211303', 40),
    ('kleague2', 'daegu', '38211304', 44),
    ('kleague2', 'daegu', '38211306', 37),
    ('kleague2', 'gimhae', '38211335', 28),
    ('kleague2', 'gimpo', '37919019', 2),
    ('kleague2', 'gimpo', '38211341', 26),
    ('kleague2', 'gimpo', '38211342', 40),
    ('kleague2', 'gyeongnam', '38211345', 5),
    ('kleague2', 'gyeongnam', '38211352', 33),
    ('kleague2', 'gyeongnam', '38211354', 29),
    ('kleague2', 'hwaseong', '37735546', 28),
    ('kleague2', 'hwaseong', '38070171', 47),
    ('kleague2', 'hwaseong', '38211255', 23),
    ('kleague2', 'hwaseong', '38211359', 27),
    ('kleague2', 'jeonnam', '37686583', 26),
    ('kleague2', 'paju', '37474575', 26),
    ('kleague2', 'paju', '37757708', 99),
    ('kleague2', 'paju', '38210506', 21),
    ('kleague2', 'paju', '38210509', 45),
    ('kleague2', 'paju', '38210513', 11),
    ('kleague2', 'seongnam', '37918814', 91),
    ('kleague2', 'seongnam', '37926835', 33),
    ('kleague2', 'seongnam', '37926844', 34),
    ('kleague2', 'seongnam', '38214862', 35),
    ('kleague2', 'seoul-eland', '38211062', 28),
    ('kleague2', 'seoul-eland', '38211065', 27),
    ('kleague2', 'seoul-eland', '38211321', 25),
    ('kleague2', 'seoul-eland', '38211322', 71),
    ('kleague2', 'suwon-bluewings', '38210502', 13),
    ('kleague2', 'suwon-bluewings', '38210504', 42),
    ('kleague2', 'suwon-fc', '13186161', 17),
    ('kleague2', 'suwon-fc', '321077', 89),
    ('kleague2', 'suwon-fc', '38211312', 31),
    ('kleague2', 'suwon-fc', '38211313', 41),
    ('kleague2', 'suwon-fc', '38211314', 66),
    ('kleague2', 'suwon-fc', '38211315', 38),
    ('kleague2', 'suwon-fc', '38211318', 40),
    ('kleague2', 'suwon-fc', '38211320', 88),
    ('kleague2', 'yongin', '37737453', 23),
    ('kleague2', 'yongin', '37916627', 77)
)
update public.team_players as player
set shirt_number = verified_shirt_numbers.shirt_number,
    updated_at = now()
from verified_shirt_numbers
where player.season = 2026
  and player.league_id = verified_shirt_numbers.league_id
  and player.team_id = verified_shirt_numbers.team_id
  and player.player_id = verified_shirt_numbers.player_id
  and player.shirt_number is null;

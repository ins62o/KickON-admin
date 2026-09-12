# 2026 선수 한글명·등번호 보정

점검일: 2026-09-12 (Asia/Seoul)

## 범위와 결과

개발 DB의 `season = 2026`, `league_id in ('kleague', 'kleague2')`, `in_squad = true` 선수 1,090명을 페이지 단위로 전수 조회했다.

| 항목 | 보정 전 | 개발 DB 반영 후 | 보류 |
| --- | ---: | ---: | ---: |
| 한글명 없음 | 144 | 0 | 0 |
| 등번호 없음 | 87 | 8 | 8 |

- 한글명 134명은 `202608280005_kleague_2026_player_localizations.sql`에 이미 검증된 매핑이 있었지만, 해당 선수가 나중에 동기화되어 `football_player_localizations`와 `team_players`에 반영되지 않은 경우였다.
- 강원 9명과 서울 김민준 1명은 2026 공식 선수단에서 새로 확인했다.
- 등번호 79명은 현재 DB의 시즌·리그·구단과 공식 선수단의 구단이 일치하는 경우만 보정한다.
- 보정 SQL은 기존 등번호가 `null`인 행만 수정한다. 이후 동기화에서 이미 채워진 값을 덮어쓰지 않는다.

적용 마이그레이션: `supabase/migrations/202609120002_complete_2026_player_metadata.sql`

개발 DB 적용 시각: 2026-09-12 20:33 KST. 운영 DB에는 적용하지 않았다.

재점검 스크립트: `node scripts/audit-player-metadata.mjs`

## 공식 출처

구단 홈페이지에 현재 선수단 또는 경기 출전 명단이 공개된 경우 이를 우선 사용했고, 페이지가 동적이거나 번호가 검색되지 않는 경우 한국프로축구연맹의 2026 현재 선수단을 교차 확인했다. K리그 구단 페이지에는 각 구단 공식 홈페이지 링크도 함께 표시된다.

### K리그1

| 구단 | 출처 |
| --- | --- |
| FC안양 | [구단 선수 상세](https://www.fc-anyang.com/player/player_view.asp?idx=97&pos=DF), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K27) |
| 대전 하나 시티즌 | [구단 뉴스](https://www.dhcfc.kr/bd/bd_v.php?buid=g_news&no_seq=27742&page=1&s_field=&s_value=), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K10) |
| 강원FC | [구단 홈페이지](https://gangwon-fc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K21) |
| 전북 현대 | [구단 홈페이지](https://www.hyundai-motorsfc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K05) |
| FC서울 | [구단 선수단](https://www.fcseoul.com/club/clubPlayerIntroductionList), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K09) |
| 울산 HD | [구단 홈페이지](https://www.uhdfc.com/fc/greetings.php), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K01) |

### K리그2

| 구단 | 출처 |
| --- | --- |
| 안산 그리너스 | [구단 홈페이지](https://www.greenersfc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K32) |
| 부산 아이파크 | [구단 경기 명단](https://www.busanipark.com/match/match_detail.php?g_date=2026%2F07%2F15), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K06) |
| 천안시티FC | [구단 홈페이지](https://cheonancityfc.kr/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K38) |
| 충북청주FC | [구단 경기 명단](https://www.chfc.kr/ma/ma_v.php?game_date=2026%2F07%2F15), [구단 출전 기록](https://www.chfc.kr/ma/p_rcd.php) |
| 충남아산FC | [구단 선수단](https://www.asanfc.com/pl/ppl.php) |
| 대구FC | [구단 홈페이지](https://daegufc.co.kr/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K17) |
| 김해FC2008 | [구단 홈페이지](https://gimhaefc2008.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K41) |
| 김포FC | [구단 홈페이지](https://www.gimpofc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K36) |
| 경남FC | [구단 선수단](https://www.gyeongnamfc.com/player/player_list.php) |
| 화성FC | [구단 홈페이지](https://www.hwaseongfc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K39) |
| 전남 드래곤즈 | [구단 홈페이지](https://www.dragons.co.kr/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K07) |
| 파주 프런티어 | [구단 홈페이지](https://www.pajufrontier.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K40) |
| 성남FC | [구단 홈페이지](https://seongnamfc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K08) |
| 서울 이랜드 | [구단 선수단](https://www.seoulelandfc.com/team/player), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K31) |
| 수원 삼성 | [구단 홈페이지](https://www.bluewings.kr/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K02) |
| 수원FC | [구단 홈페이지](https://www.suwonfc.com/), [K리그 구단 선수단](https://www.kleague.com/club/club.do?teamId=K29) |
| 용인FC | [구단 선수단](https://yonginfc.co.kr/team/pro) |

## 보류한 등번호 8명

다음 행은 개발 DB의 구단과 2026-09-12 공식 현재 구단이 다르거나 선수 등록이 확인되지 않아 번호를 입력하지 않았다.

| DB 구단 | 선수 | player_id | 공식 확인 상태 | 처리 |
| --- | --- | --- | --- | --- |
| 김천 | 안찬기 | 37389550 | 제주 No.21 | 김천 행 유지, 번호 미입력 |
| 김천 | 홍원진 | 37474578 | 전남 No.77 | 김천 행 유지, 번호 미입력 |
| 김천 | 변경준 | 37563554 | 서울 이랜드 No.11 | 김천 행 유지, 번호 미입력 |
| 김천 | 박지원 | 37620497 | 수원 삼성 No.91 | 김천 행 유지, 번호 미입력 |
| 김천 | 박상영 | 37735267 | 대구 No.41 | 김천 행 유지, 번호 미입력 |
| 김천 | 임준영 | 37918921 | 충북청주 No.39 | 김천 행 유지, 번호 미입력 |
| 울산 | 이용 | 319813 | 울산 코치로 표시 | 선수 행 유지, 번호 미입력 |
| 김포 | 홍태형 | 38211338 | 현재 공식 선수단에서 확인되지 않음 | 번호 미입력 |

이 8개 행은 선수단 동기화가 최신 이적·등록 상태를 반영한 뒤 다시 확인해야 한다. 새 구단의 번호를 이전 구단 행에 넣으면 `(season, league_id, team_id, player_id)` 의미가 깨지므로 자동 보정 대상에서 제외했다.

## 적용 전후 확인 쿼리

```sql
select league_id, count(*)
from team_players
where season = 2026
  and league_id in ('kleague', 'kleague2')
  and in_squad = true
  and display_name_ko is null
group by league_id;

select league_id, count(*)
from team_players
where season = 2026
  and league_id in ('kleague', 'kleague2')
  and in_squad = true
  and shirt_number is null
group by league_id;
```

개발 DB 적용 후 첫 쿼리는 0행이었고, 두 번째 쿼리의 합계는 위 보류 목록과 같은 8명이었다. 전체 선수 수도 K리그1 470명, K리그2 620명, 합계 1,090명으로 유지됐다.

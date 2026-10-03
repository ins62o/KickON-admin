# 2026-10-03 운영 경기장 변경 점검 및 팀 공지 등록

## Verdict

`MATCH_DATA_REPAIRED`

운영 프로젝트 `smihjaucucffmsbktnmp`에서 전남–대구전 한 경기의 경기장 연결을 수정하고 요청한 네 팀 공지를 기존 관리자 UI로 등록했다. 수정 전 조회는 2026-10-03 22:26:23 KST, 최종 경기/공지 스냅샷은 22:42:39 KST이다. 개발 DB, 팀 기본 경기장, 다른 경기, 애플리케이션 실행 코드는 변경하지 않았다.

실제 운영 REST API, 네 팀 일반 사용자의 공지 피드 및 미확인 공지 RPC, 인천 일반 사용자의 다른 팀 공지 접근 제한, 앱의 실제 mapper/공지 필터/GPS 판정 함수를 검증했다. 네이티브 모바일 화면은 이번 환경에서 실행하지 못했으며, 화면 렌더링 확인을 완료한 것으로 주장하지 않는다. 미래 경기의 인증 기록을 운영 DB에 생성하지 않았다.

## 1. 전남 vs 대구

- Match ID: `sportmonks-19676305` / Sportmonks ID `19676305`
- 홈/원정: `jeonnam` / `daegu`
- 경기 시간: 2026-10-24 14:00 KST (`2026-10-24T05:00:00Z`), 변경 없음

| 항목 | BEFORE | AFTER |
|---|---|---|
| Stadium ID | sportmonks-venue-5186 | suncheon-palma-stadium |
| 경기장 | 광양축구전용구장 | 순천팔마종합운동장 |
| 주소 | 전라남도 광양시 백운로 1641 | 전라남도 순천시 팔마로 333 |
| 위도 | 34.9330583 | 34.9383274 |
| 경도 | 127.7274262 | 127.5194672 |
| GPS 기준 좌표 | 34.9330583, 127.7274262 | 34.9383274, 127.5194672 |
| GPS 반경 | 300m | 300m |

수정 여부: YES. [K리그 공식 공지](https://www.kleague.com/news_view.do?orderBy=seq&page=1&seq=96446&viewOption=album)와 일치한다. 기존 광양 경기장 행은 수정하지 않고 팔마 주경기장을 별도 등록했다.

주소와 축구장·육상 트랙 시설은 [순천시 공식 시설 안내](https://www.suncheon.go.kr/yeyak/training/intro), 주소는 [순천시체육회](https://www.scsports.kr/ko/sub_info_02.do)에서도 교차 확인했다. 좌표는 [OSM 주경기장 도형 way 480425370](https://www.openstreetmap.org/way/480425370)의 위·경도 범위 중점으로 산출하고 실제 지도에서 주경기장 형태와 위치를 확인했다. 종합시설 전체 도형 way 549060481, 보조 축구장 way 490617007, 야구장 way 655635186의 중심을 사용하지 않았다.

일정 수정 RPC는 선택한 경기장 좌표와 동일하면 fixture의 별도 attendance 좌표를 NULL로 유지한다. 따라서 수정 후 앱과 서버 모두 새 `stadiums` 행 좌표를 사용한다. 이름만 순천으로 바뀌고 GPS가 광양에 남는 상태가 아니다.

### 실제 데이터 흐름

Sportmonks → 운영 `sync-football-data` → `fixtures.stadium_id` → `stadiums` → Supabase REST → `supabaseFootballRepository.getFixture/getTeamFixtures` 및 `supabaseStadiumRepository.getStadium` → `mapFixture/mapStadium` → `useStadium` → 경기 목록·직관 화면 `FixtureCard`, `AttendanceScreen` → GPS 판정 → `create_gps_attendance`.

앱은 stadiumId로 경기장 행을 조회하고 `getLocalizedStadiumName`이 한국어 이름을 우선 사용한다. 현재 소스에서 경기장 지도를 표시하는 별도 지도 컴포넌트는 찾지 못했다. 실제 경기/경기장 REST 응답 및 지도에 사용할 좌표를 검증했다.

GPS 앱 판정 함수는 경기장 좌표와 300m를 사용한다. 운영 서버 RPC는 `coalesce(fixtures.attendance_latitude, stadiums.latitude)` / longitude, fixture 반경 300m를 사용한다. 실제 앱 소스를 불러온 테스트와 운영 서버 함수의 동일 거리식을 사용한 계산에서 중심과 299m는 허용, 301m와 기존 광양 위치(약 18,966m)는 거부했다. 앱 테스트 시각은 해당 경기일 킥오프 전으로 설정했다. 운영 날짜나 사용자의 위치·직관 기록을 조작하지 않았다.

## 2. 수원FC vs 충남아산

- Match ID: `sportmonks-19676442` / Sportmonks ID `19676442`
- 경기 시간: 2026-10-25 14:00 KST
- 홈/원정: `suwon-fc` / `chungnam-asan`
- 경기장: 수원종합운동장(캐슬파크)
- Stadium ID: `sportmonks-venue-14076`
- 주소: 경기도 수원시 장안구 경수대로 893
- 좌표 / 유효 GPS 좌표: `37.2977947, 127.0113949`, 반경 300m
- 수정 여부: NO. [홈·원정 교환 공식 공지](https://www.kleague.com/news_view.do?orderBy=seq&seq=95131&viewOption=album)와 일치한다. 전후 스냅샷이 동일하다.

## 3. 포항

| 경기 | Match ID | 경기장 |
|---|---|---|
| 9/9 김천전 19:30 KST | sportmonks-19648065 | 상주시민운동장 |
| 9/20 서울전 19:00 KST | sportmonks-19648053 | 상주시민운동장 |
| 이후 홈경기 샘플: 10/18 안양전 16:30 KST | sportmonks-19648041 | 포항스틸야드 |

지정된 두 경기는 [공식 공지](https://www.kleague.com/news_view.do?category=notice&orderBy=seq&page=1&seq=96195&viewOption=list)와 일치한다. 상주 Stadium ID는 `sangju-civic-stadium`, GPS 기준은 `36.43228, 128.16156`이다. 이후 홈경기 표본은 운영 DB에 존재하는 9/20 이후 홈경기 한 건을 확인한 범위이며, 미등록 미래 경기를 정상이라고 확대 해석하지 않는다.

9/9는 배포된 resolver의 fixture ID·팀·날짜·리그·시즌·적용 시점 검증을 거친 개별 공식 override이다. 9/20은 기존 개별 fixture manual override로 보호되고 있다. 포항 전체 홈경기 또는 특정 날짜 이후 모든 홈경기를 상주로 바꾸는 규칙은 배포 소스·관련 활성 override에서 찾지 못했다. 홈 경기장 fallback은 스틸야드이며 팀 테이블에 기본 경기장 컬럼은 없다.

포항 팀의 기존 공지는 없었다. 관리자 전체 팀 공지 목록에는 서울 팀 대상으로 작성된 9/20 포항–서울전 공지 한 건이 기존부터 존재한다. 이번에 포항/서울 과거 경기 공지를 생성하거나 수정하지 않았다.

## 4. 강원

운영 DB의 2026 강원 홈경기 17건을 조회했고 모두 `api-venue-5166` / 강릉종합운동장이다. 좌표는 `37.77363, 128.89757`. 일부 과거 경기의 개별 GPS override도 같은 강릉 좌표이며, 10/9 부천전·10/18 인천전 등 예정 경기는 경기장 행 좌표를 사용한다. 전후 경기장 데이터가 동일하다.

[2027~2028 분산 개최 계획](https://www.kleague.com/news_view.do?orderBy=seq&page=1&seq=96408&viewOption=album)을 근거로 2026 경기나 팀 기본값을 춘천으로 바꾼 흔적은 찾지 못했다. 배포 resolver에는 2026년에 개별 검증된 7개 fixture ID의 강릉 보정이 있으나, 2027~2028 계획을 2026 전체에 적용하는 규칙은 없다.

## 5. Sync / Override 위험

- 외부 Provider: Sportmonks Football v3. 실제 운영 배포 함수 소스를 다운로드하여 확인했다.
- 일정 동기화: provider venue → 기존 Sportmonks stadium ID mapping → 개별 공식 venue resolver → fixture upsert. provider venue가 없으면 저장된 경기장, 마지막으로 홈 경기장 fallback을 사용한다.
- 경기장 catalog upsert: 기존의 0이 아닌 좌표를 보존하지만 경기장명·주소 등의 provider 값은 갱신할 수 있다. 이번 팔마 행은 provider ID를 임의로 지정하지 않았다.
- Cron: `kickon-live-football-sync` 매분, `kickon-post-match-football-sync` 5분마다. history backfill과 team metrics/squad 작업도 등록돼 있다. 운영 cron 스케줄을 바꾸거나 강제로 전체 동기화를 실행하지 않았다.
- 실시간 동기화: 운영 `sync-live-football` 배포 소스도 다운로드했다. 이 함수는 경기 상태·스코어·라인업 등을 처리하며 `stadium_id`나 stadium catalog를 쓰는 코드가 없다.
- Trigger: `fixtures_protect_manual_overrides`가 INSERT/UPDATE 전에 활성 개별 override를 적용한다.
- 수동 수정 덮어쓰기: 전남 fixture의 `stadium_id = suncheon-palma-stadium`, `blocks_sync=true` 보호를 생성했다. 시간·스코어·다른 경기장 필드는 잠그지 않았다. 앱과 서버 GPS는 이 경기장의 동일 좌표를 사용한다.
- 검증: 임시 테이블에 실제 운영 protection trigger를 부착하고 광양 stadium ID로 UPDATE를 시도했을 때 팔마 ID를 유지했다. 실험 트랜잭션은 rollback했고 실제 운영 fixture를 되돌리는 UPDATE는 하지 않았다.
- 잔여 위험: 배포 코드의 알 수 없는 provider venue 등록에서 홈 경기장 preferred ID fallback이 존재한다. 포항 전체를 상주로 변경하는 규칙은 아니지만 새 대체 경기장을 처음 받는 경우 별도 검토가 필요하다. 공식 자료 없는 미래 경기는 수정하지 않았다.
- 로컬 소스 위험: admin 저장소의 기존 변경 중인 `supabase/functions/sync-football-data/index.ts`는 운영 배포 소스와 달리 K리그2 홈 기본 경기장을 강제하는 오래된 로직이 남아 있다. 이번 작업에서 이를 배포하거나 기존 변경을 덮어쓰지 않았다. 다음 해당 함수 배포 전 실제 운영 소스와 정합화해야 한다.
- 추가 조치: 이번 경기에는 기존 override로 충분하다. 신규 override 시스템·트리거·스키마·앱 코드·Edge Function 배포는 추가하지 않았다.

## 6. 팀별 공지

등록 전 및 경기 수정 직후에 대상 네 팀의 기존 NOTICE를 조회했으며 모두 없었다. 등록은 운영 관리자 `/community`의 공지 작성 → 팀별 공지 → 정확한 대상 팀 선택으로 진행했다. 전체 공지로 생성하지 않았다.

| 대상 / team_id | Notice ID | 제목 | 등록/노출 시작 KST |
|---|---|---|---|
| 전남 / jeonnam | f30ba10d-7765-46e8-b6dc-3858062ba36c | 10월 24일 대구전 경기장 변경 안내 | 10/3 22:36:50 |
| 대구 / daegu | 27a38d5f-1623-4044-9e4d-d7416fb0ed2b | 10월 24일 전남전 경기장 변경 안내 | 10/3 22:37:46 |
| 수원FC / suwon-fc | 3c4d722d-5ead-455f-959e-ffee34a28b6a | 10월 25일 충남아산전 경기 장소 안내 | 10/3 22:38:25 |
| 충남아산 / chungnam-asan | feb2b74c-f31d-4945-8d4c-256639650c77 | 10월 25일 수원FC전 경기 장소 안내 | 10/3 22:39:00 |

네 건 모두 등록 YES, `board=TEAM`, `category=NOTICE`, `moderation_status=VISIBLE`, 공식 작성자 표시 `관리자`. 내용은 사용자가 제공한 한국어 문구와 정확히 동일하다. 실제 스키마에 별도 published/published_at/pinned/locale 필드는 없어 임의로 만들지 않았다. 즉시 노출은 created_at 및 VISIBLE 조건으로 결정된다.

### 앱 노출 검증

Admin UI → `admin_create_community_notice` → `posts` → `community_post_feed`(security_invoker=true) → `getTeamPosts(teamId)` / `get_unread_community_notices('TEAM',teamId)` → `useTeamPosts/useUnreadNotices` → `CommunityScreen`의 현재 사용자 teamId에 따른 팀 게시판·미확인 공지 영역.

기존 네 팀 일반 사용자의 실제 auth.uid 및 authenticated 역할을 읽기 전용 트랜잭션에서 적용해 운영 조회 함수를 실행했다. 각 팀은 자신의 새 공지 1건이 team feed 및 unread RPC에 반환됐고, 다른 팀 공지 수와 전체 게시판의 새 공지 수는 모두 0이었다. 인천 일반 사용자도 네 팀 새 공지를 읽을 수 없고, 전남 ID를 지정해 호출한 외부 팀 unread RPC도 0건이었다. 계정 팀·권한·공지 읽음 상태를 변경하지 않았다.

앱의 실제 mapPost/공지 필터를 운영 피드 데이터로 실행했고 네 팀 각각 1건, 인천·전체 범위는 0건이었다. 기존 사용자 차단/공지 읽음/가입 완료·tracking 시작일 이후 조건은 그대로 적용된다. 이후 가입한 사용자에게 과거 공지를 미확인 공지로 다시 보여주는 방식은 기존 서비스 정책에 따른다. 네이티브 모바일 렌더링 확인은 미실시다.

포항 신규 공지: NO. 지정된 두 경기가 이미 종료됐고, 이후 경기장 변경의 새로운 공식 근거가 없다.
강원 신규 공지: NO. 발표가 2027~2028 계획이며 2026 경기 변경 공지가 아니다.

## 7. 변경 파일 및 실제 mutation

실행 코드 변경 없음. 이번 작업으로 아래 보고 자료만 추가했다.

- `report.md`: 공식 근거, 데이터 흐름, 위험 및 결과.
- `evidence.json`: 대상 경기 BEFORE/AFTER, 포항·강원 원본 확인 범위, 좌표 근거와 검증 결과.
- `catalog-insert.sql`: 실제 실행한 팔마 경기장 1행 INSERT SQL. 대상 경기 identity·기존 광양 연결·팔마 중복 부재를 확인하는 guard 포함.
- `mutations.json`: 기존 일정 수정 및 네 건 공지 등록 RPC의 실제 인자와 생성 결과.
- `notices-created.json`: 생성한 공지의 ID/team_id/title/content/board/category/moderation_status/created_at 전체 데이터.
- `fixture-saved.png`, `team-notices-saved.png`: 운영 관리자 화면 증거.

실제 일정 mutation:

```json
{
  "rpc": "admin_update_fixture_schedule",
  "p_fixture_id": "sportmonks-19676305",
  "p_league_id": "kleague2",
  "p_kickoff_at": "2026-10-24T05:00:00.000Z",
  "p_stadium_id": "suncheon-palma-stadium",
  "p_latitude": 34.9383274,
  "p_longitude": 127.5194672,
  "p_radius_meters": 300
}
```

위 mutation에 공식 공지 번호·경기 지정·좌표 출처·시간 미변경 이유를 함께 저장했다. 실제 RPC는 변경된 경기장 필드 한 개만 override로 보호하고 감사 로그 `FIXTURE_SCHEDULE_UPDATED`에 before/after를 남겼다. 공지는 기존 `admin_create_community_notice(target_board='TEAM', target_team_id, notice_title, notice_content)`으로 등록됐고 네 건 모두 `COMMUNITY_NOTICE_CREATED` 감사 로그를 확인했다. 정확한 이유와 공지 원문은 JSON 파일에서 확인할 수 있다.

검증 결과: 현재 앱 API가 제공하는 경기장 이름·주소·좌표와 GPS 기준은 공식 변경 장소와 일치한다. 네 팀 공지가 팀별 조회에 정확히 연결되고 다른 팀 일반 사용자에게 노출되지 않는 것을 운영 조회 정책과 앱 필터로 검증했다. 모바일 화면 렌더링과 경기일 실제 현장 GPS 인증은 이번 검증 범위에 포함하지 않았다.

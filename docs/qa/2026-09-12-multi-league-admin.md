# K리그1·K리그2 관리자 지원 점검 결과

검증일: 2026-09-12. 대상: `/Users/inseong/kickon-admin`, 기존 개발 서버 `http://localhost:3000`, 개발 Supabase.

## 결과와 검증 경계

| 구분 | 선수 exact count | 전체 페이지에서 수집한 고유 선수 | 팀·순위 |
|---|---:|---:|---:|
| 전체 | 1,090 | 1,090 (37페이지) | 29 |
| K리그1 | 470 | 470 (전체 수집 결과에서 리그별 검산) | 12 |
| K리그2 | 620 | 620 (21페이지) | 17 |

개발 DB 최종 확인 시각: **2026-09-12 20:33:13 KST**. `in_squad = true`, 2026 시즌 기준이다. 공개 Supabase 클라이언트의 실제 RLS 경로에서도 같은 값을 확인했다. K리그2 일정은 실제 UI에서 **272경기**였다.

코드·새 마이그레이션·검증 도구를 작성했다. `202609120001_admin_multi_league.sql`과 후속 선수 메타데이터 보정 `202609120002_complete_2026_player_metadata.sql`은 **개발 Supabase에 적용했다. 운영 DB 배포, 실제 선수 삭제, 외부 동기화 실행은 하지 않았다.** 쓰기 검증은 임시 PostgreSQL(PGlite)에서도 수행했다. 실제 Edge Function 소스는 이 저장소에 없으므로, 요청 전달 검증과 실제 공급자 동기화 성공을 구분한다.

## 공통 설정과 식별

- `src/lib/football/config.ts`: `CURRENT_SEASON`, `SUPPORTED_LEAGUES`, 리그 타입·레이블·배지·시즌 경계·빈 상태 문구·URL/복합 키·명시적 수정 범위 검증을 관리한다.
- 2026 SportsMonks 매핑: K리그1 `1034 / 26894`, K리그2 `1362 / 27443` (리그/시즌 ID). 개발 DB `football_provider_seasons`와 대조했다.
- SQL 예약 작업은 `admin_football_leagues()`의 리그 매핑과 기존 `football_provider_seasons`를 함께 사용한다. 다음 시즌에는 프런트/API 설정의 시즌 매핑과 공급자 시즌 카탈로그를 함께 확인해야 한다.
- 선수 키는 `(season, league_id, player_id)`. 상세 URL도 세 값을 보존한다. 리그가 없는 이전 URL은 두 리그를 조회하되 2건 이상이면 선택을 요구하는 오류를 표시한다.
- `teams.id`, `fixtures.id`는 기존 전역 식별자다. 경기 상세에서는 전역 ID로 찾은 실제 리그와 요청 리그가 일치해야 한다.
- `useClientData`는 리그 변경 중 이전 리그 데이터를 새 리그 이름 아래 표시하지 않는다.

## 발견한 하드코딩과 조치

| 기존 위치 | 문제 | 조치 |
|---|---|---|
| `src/lib/data/operations.ts` | 선수·팀 선수·순위·득점자·일정의 `kleague` 및 시즌 고정, 선수 상세 ID 단독 조회 | 전체/리그별 공통 인자, 복합 식별, 정확한 count 및 페이지 조회 |
| `src/lib/data/dashboard.ts` | `CURRENT_LEAGUE_ID`, `CURRENT_DIVISION`, K1 기준 상태/목록 | 실제 시즌별 소속으로 구단 리그를 결정하고 전체/리그 지표 분리 |
| `src/lib/data/sync-control-options.ts` | K1 구단만 남기는 옵션, 제한된 경기 | 선택 리그의 전체 구단·경기 옵션 |
| `src/lib/data/provider-diffs.ts` | 기본 리그 K1, ID 배열 200개 잘림 | 실제 범위 인자, ID 배치 및 페이지 조회; 선수/순위 비교에는 단일 리그 필수 |
| `src/lib/operations/actions.ts` | 선수·순위 보정의 고정 `p_league_id` | 폼에서 명시한 시즌·리그 검증/전달 |
| `src/lib/admin/actions.ts` | 등록/검증 한글명 등의 암묵적 범위 | 등록·병합·검증명에 실제 시즌·리그 전달 |
| `server/admin-api/lambda.ts` | 고정 SportsMonks ID, K1만 허용하던 동기화, 스냅샷/reconcile 고정 범위 | 7개 동기화 작업 모두 리그 선택·대상 검증·리그별 공급자 ID·실행 기록 |
| `src/lib/search/client.ts`, `server/next-api/search/route.ts` | 시즌 고정 및 ID 단독 중복 제거/상세 링크 | 공통 시즌·지원 리그·복합 키·안전한 URL |
| `src/lib/data/player-operations.ts` | K1 수동 보정 및 일부 ID 배열 절단 | 리그별 보정/변경 조회, 배치 처리 |
| `src/lib/data/reports.ts`, `audit.ts`, `src/lib/sync/diagnostics.ts` | 구 상세 URL, 동명이인/ID 충돌 가능성 | 현재 정적 상세 경로 및 가능한 실제 범위 보존; 모호한 레거시 제보 ID를 임의로 합치지 않음 |
| `src/lib/data/catalog.ts` | 12개 로고 및 불완전한 팀 이름 사전 | 29팀 이름 및 K2 17개 로고 추가 |
| `202609020003_schedule_squad_and_team_metrics.sql`에 정의된 예약 함수 | K1/2026 고정 선수단 대상 | 새 마이그레이션에서 현재 시즌의 두 리그 대상으로 교체 |
| `202608290020_post_match_and_history_sync.sql`에 정의된 예약 함수 | 종료 경기에 `1034`, `26894` 등 고정값; 전역 history 완료 판정 | 실제 종료 경기의 리그·연도·공급자 시즌, 리그별 완료 판정 |
| `202609060011_poll_live_football_every_five_seconds.sql`에 정의된 함수 | 실시간 요청에 리그 없음 | 등록된 각 지원 리그의 명시적 요청, 기존 주기와 poll 수 유지 |
| `202608290016_backfill_fixture_goal_events.sql`에 정의된 함수 | 득점 이벤트 보강 범위 없음 | 명시적 시즌·리그를 요구하는 서비스용 RPC 추가 |
| `infrastructure/cloudfront/viewer-request.js` | 동적 상세 리디렉션에서 쿼리 유실, 경기 상세 경로 없음 | 선수·팀·경기의 리그/시즌 보존, 경기 정적 상세로 연결 |

최종 `src`, `server` 검색에서 `.eq('league_id', 'kleague')`, `p_league_id: 'kleague'`, `CURRENT_LEAGUE_ID`, `CURRENT_DIVISION`, 기본 `leagueId = 'kleague'`, `.range(0, 1999)` 패턴은 남아 있지 않다. 공통 설정과 리그별 순위 규칙에는 의도적으로 리그 ID가 존재한다. 기존 마이그레이션의 당시 데이터 보정/시드문은 변경하지 않았다.

## 화면별 동작

| 화면 | 지원 내용 |
|---|---|
| 대시보드 | 기본 전체, 리그 필터, 등록 구단/선수·오늘/진행 경기 지표, 실제 리그별 구단 순위/상태. 서비스 가입자·사용량·전역 동기화 실패는 전체 기준임을 표시 |
| 선수 관리 | 기본 전체; 전체/K1/K2 URL 필터; exact 총수와 검색 결과 수; 리그 전환 시 검색·구단·페이지 초기화; K1/K2 배지와 복합 행 키 |
| 등록·상세 | 등록 시 리그 먼저 선택 후 해당 팀만 표시. 수정·삭제·병합·한글명 등록에 실제 범위 전달. 잘못된 상세 범위는 오류 |
| 팀·순위 | K1/K2 선택, 선택 리그 데이터만 사용, K2 17팀·로고·약칭·코드, 팀별 선수 명단 및 순위 보정 범위 유지 |
| 일정 | 전체/K1/K2 선택, 전체 경기 조회, 경기 상세·라인업·점수/상태 보정, 경기장/일정/직관 위치 수정에 실제 리그 전달 |
| 데이터 관리·동기화 | 실행 전 리그 선택, 해당 팀/경기만 선택, 실제 scope를 API·RPC·감사 메타데이터에 전달, 스냅샷/reconcile 실패를 성공으로 숨기지 않음 |
| 검색·제보·감사 | 두 리그 검색 및 안전한 상세 링크. 리그를 확정할 수 없는 레거시 기록은 전역/미지정으로 다룸 |
| SportsMonks 사용량 | 공급자 할당량은 계정 전체 값이므로 전체 사용량으로 명시; 리그별 할당량으로 오표시하지 않음 |

순위 상태는 확정 승격/강등 표현을 피하고 현재 순위권으로 표시한다. 2026 K2는 17팀, 1·2위 자동승격 및 3~6위 플레이오프 규칙을 [K리그 공식 대회요강](https://www.kleague.com/about/competition.do)과 대조했다.

조회 성공 후 K2 데이터가 0건이면 `등록된 K리그2 데이터가 없습니다`를 표시한다. 조회 실패는 빈 상태로 취급하지 않는다. 운영 DB의 실제 빈 상태는 이번에 직접 접속하여 검증하지 않았으며, 빈 응답/실패 응답은 자동 테스트로 구분 검증했다.

## 페이지네이션

`src/lib/data/pagination.ts`는 요청 범위를 최대 1,000행으로 제한하고, **실제로 반환된 행 수만큼** 다음 오프셋을 이동한다. 빈 페이지까지 조회하므로 서버 상한이 250행인 경우도 누락되지 않는다. 중간 페이지 오류가 나면 부분 목록을 성공으로 반환하지 않는다.

선수 조회는 `league_id → team_id → player_id`로 정렬한다. 고정 시즌 안에서 마지막 키까지 합하면 유일하다. 조회된 복합 키의 중복과 exact count 불일치도 검사하여 동기화 중 데이터가 바뀐 경우 재조회 안내를 표시한다. 검색·필터·UI 페이지 이동은 이렇게 완전히 받은 목록에서 수행한다. 단순 총수는 `count: 'exact', head: true`를 사용한다.

## DB 점검 및 새 마이그레이션

추가 파일: `supabase/migrations/202609120001_admin_multi_league.sql`. 기존 마이그레이션은 직접 수정하지 않았다.

| 테이블 | 키/범위 점검과 조치 |
|---|---|
| `team_players` | 기존 PK `(season, league_id, player_id)` 유지. 시즌·리그·팀·선수의 활성 선수 인덱스 추가. 수정·병합·삭제 범위 격리 검증 |
| `teams` | 전역 팀 ID PK 유지. 현재 시즌 소속은 standings/선수/경기로 결정. 팀 자체를 리그마다 복제하지 않음 |
| `fixtures` | 전역 fixture ID PK 유지. `(league_id, kickoff_at, id)` 조회 인덱스 추가. 실제 리그를 검증하는 점수/일정 RPC 오버로드 |
| `league_standings` | 기존 PK `(season, league_id, team_id)` 유지. 순위 조회 인덱스 및 실제 `p_league_id` 검사 |
| `player_scoring_stats` | 기존 PK `(season, league_id, player_id)` 유지. 팀 포함 조회 인덱스 추가 |
| `fixture_lineups` | 전역 fixture ID와 팀으로 식별. 부모 경기에서 리그를 확정하므로 리그를 PK에 중복 추가하지 않음 |
| `fixture_lineup_players` | fixture를 포함한 기존 복합 키 유지. 경기 범위 조회와 연결 |
| `player_squad_snapshots` | 기존 시즌·리그·팀 및 snapshot UUID 유지. 생성 RPC의 암묵적 K1 기본값 제거 |
| `player_change_events` | nullable 시즌·리그 추가. 스냅샷으로 확정 가능한 과거 행만 채움. 후보 ingest/reconcile 및 중복 판정에 scope 포함 |
| `provider_entity_snapshots` | payload hash 중복 판정에 시즌·리그 추가. 기존 unique index와 upsert conflict target을 함께 교체 |
| `manual_overrides` | 기존 활성 보정 unique `(entity_type, entity_id, season, league_id, field_path)` 유지. 시즌/리그 컬럼 기본값 제거, 수정 RPC에 범위 검증 |
| `football_sync_state` | 기존 전역 `sync_key` PK 유지. nullable 시즌·리그와 조회 인덱스 추가. 다른 scope로 같은 키를 upsert하면 거부하는 트리거. 신규 writer는 `operation:season:league_id` 같은 고유 키 사용 |

RPC의 기존 권한/감사 흐름을 보존하면서 범위를 검증한다. 수동 선수 등록·상세 수정·보정·순위 수정·병합, 검증 한글명, 스냅샷, 공급자 후보 수집/반영 판정을 점검했다. `admin_delete_player`는 이미 복합 범위와 리그 포함 감사 기록을 사용하므로 기존 정의를 유지하고 격리 동작을 SQL 테스트했다.

검증 한글명 테이블은 `(provider, provider_player_id)` 기준의 전역 인물 사전이다. 선택한 등록의 존재를 scope로 검증하고 추가 감사 로그를 남기되, 이름 자체는 동일 공급자 선수 ID의 여러 시즌·리그에 전파된다. UI에 이 동작을 설명했다. 한 등록에만 적용하는 이름 변경은 일반 선수 수정으로 처리한다.

RLS는 저장소의 정책 정의에서 K1 고정 조건이 없는 것을 확인했다. 실제 개발 DB에서 공개 읽기 경로로 K2 620명/17팀을 확인했다. 원격 DB 전체 정책·함수 정의를 SQL로 직접 덤프한 것은 아니며, 임시 DB 테스트의 권한 함수는 스텁이므로 **실제 역할별 쓰기 RLS 검증을 대체하지 않는다**.

## 실행한 검증

- `npm run typecheck`: 통과.
- `npm run lint`: 통과.
- `npm test`: 71개 통과, 실패 0개.
- `npm run build`: 통과. `/schedules/detail` 포함 정적 페이지 25개 생성.
- `npm run build:admin-api`: 통과.
- `git diff --check`: 통과.
- `node scripts/verify-football-data.mjs`: 개발 DB 1,090 / 470 / 620, 팀 12 / 17 및 복합 키 중복 없음.
- `node scripts/audit-player-metadata.mjs`: 개발 DB 한글명 누락 0명, 등번호 누락 8명. 8명 모두 이적·코치 전환·현재 등록 미확인으로 분리한 보류 목록과 일치.
- Supabase 원격 마이그레이션 이력: 개발 프로젝트에 `202609120001`, `202609120002` 적용 확인.
- `node scripts/verify-football-migration.mjs /tmp/kickon-db-check/node_modules/@electric-sql/pglite/dist/index.js`: 새 SQL 전체 컴파일 및 아래 동작 통과. PGlite는 `/tmp`에 설치했으며 제품 의존성/lockfile을 바꾸지 않았다.
- SQL 동작: 누락/잘못된 리그 거부, 다른 리그로 팀 이동 거부, K2 등록/수정/병합/삭제 후 K1 보존, 순위 보정, 검증명 감사, 경기 리그 불일치 거부, 경기 점수/일정/위치 보정, 스냅샷과 후보 중복 판정, 모든 예약 요청의 실제 공급자 ID, K1 history 완료가 K2를 가로막지 않음, 동기화 상태 키 scope 충돌 거부.
- 자동 테스트: 서버 반환 상한 1,000 및 250, 1,090행 완전 조회, 후속 페이지 실패, 빈 K2, 502개 ID 배치, 충돌 선수 URL/키, 명시적 수정 범위, 전체 동기화 모드 공급자 매핑, 인증을 포함한 mock 관리자 API 요청/스냅샷/실행 메타데이터, CloudFront 쿼리 보존.

실제 로그인된 개발 Chrome UI에서 확인한 항목:

1. 전체 1,090명, K1 470명, K2 620명 표시.
2. 전체 37페이지와 K2 21페이지의 링크를 수집해 각각 1,090/620개 고유 복합 식별자 확인.
3. `파주` 검색 결과 36명, 30+6 페이지, 중복 없음. 리그 변경 시 검색 초기화, 새로고침/뒤로 가기 시 리그 URL 보존.
4. K1 순위 12행, K2 17행. 파주 상세 36명과 K2 선수 상세 연결.
5. K2 대시보드 17구단/620명, 구단 카드의 K2·코드·로고 표시.
6. K2 선수 등록/선수단 동기화 선택창에 17팀 표시. 실제 제출은 하지 않음.
7. K2 272경기, 상세 라인업, 점수/상태 및 일정/경기장/직관 위치 수정창. K2 경기의 리그를 K1로 바꾼 URL은 명확한 오류 상태.
8. 데이터 관리에서 K2 동기화 기록과 전체 SportsMonks 사용량 구분.
9. 390×844 모바일 선수 목록·등록창·경기 일정/카드, 데스크톱 목록/순위 확인. 문서 폭 375px로 viewport 390px를 넘지 않음. 테스트 후 viewport 복원.
10. 개발 중 발생했던 일시적 HMR 파싱 로그는 수정 후 사라졌으며 최종 컴파일/빌드가 통과했다. 최신 화면 확인 구간의 신규 JS 오류는 관찰되지 않았다.

## 운영 반영 순서와 남은 위험

1. **운영 반영 전 운영 함수 정의 및 마이그레이션 이력을 다시 대조한다.** 개발 DB에서는 두 마이그레이션을 적용했지만, 이 저장소와 다른 축구 앱 저장소가 같은 운영 DB를 관리할 수 있으므로 기존 함수 변경을 새 정의로 덮어쓰지 않는지 확인한다.
2. 개발 DB 마이그레이션은 적용됐다. 운영 반영 전 실제 관리자 역할로 등록/수정/병합/삭제·RPC 권한을 한 번 더 검증한다. 새 UI의 경기 수정/검증명 RPC 오버로드는 운영에도 두 마이그레이션이 적용되어야 한다.
3. 별도 Edge Function 배포가 필요할 수 있다. `sync-team-squad`, `sync-lineups`, `sync-team-metrics`는 문자열 `leagueId`, `season`, 공급자 ID를 받으며, `sync-football-data`/`sync-live-football`은 숫자 공급자 `leagueId`와 `seasonId`를 받는다. 실제 구현이 이를 사용하고 모든 upsert에 적절한 복합 키를 쓰는지 원격 함수 저장소에서 검증해야 한다. 이 저장소만으로 실제 SportsMonks 연동 완료를 보장할 수 없다.
4. 원격 writer는 `football_sync_state`에 시즌·리그와 리그별 고유 `sync_key`를 저장해야 한다. 기존 전역 상태를 K1/K2로 임의 귀속하지 않는다. history 완료 기록에 scope가 없으면 해당 리그의 완료로 인정하지 않아 다음 예약 시 다시 요청될 수 있다.
5. 공급자 선수 변경 후보 생산자는 각 후보에 `season`, `leagueId`를 넣어야 한다. 누락 요청은 거부된다. 서비스 전용 `invoke_fixture_goal_backfill` 호출자도 새 3인자 시그니처로 변경해야 한다.
6. 기존 cron 주기를 바꾸지는 않았으나 두 리그를 지원하면 외부 API 요청량이 늘어난다. 특히 5초 실시간 polling을 리그별로 보내므로 공급자 할당량과 동시 실행/쿨다운 키도 리그별로 확인한다.
7. DB 이후 관리자 API, 정적 프런트, CloudFront Function 변경을 함께 반영한다. UI만 배포하면 새 RPC 또는 원격 동기화 계약이 맞지 않을 수 있다.
8. 운영 K2가 없을 때의 실제 역할별 빈 화면 확인은 배포 전 추가 확인 항목이다. 코드는 K1 데이터로 대체하지 않는다.

## 수정 파일

아래 목록은 이번 작업의 파일이다. 작업 시작 때 이미 있던 `src/lib/admin/console-data.ts`, `tests/discord-notifications.test.ts`, `tests/completed-registration.test.ts`, `202609110001`~`202609110004` 마이그레이션은 기존 사용자 변경으로 보존했다. `dashboard.ts`, `operations.ts`, `search/client.ts`는 시작 시 변경이 있던 파일에 이번 지원 범위를 추가했다.

- `docs/provider-player-change-candidates.md`
- `docs/qa/2026-09-12-multi-league-admin.md`
- `infrastructure/cloudfront/viewer-request.js`
- `public/teams/ansan-greeners.webp`
- `public/teams/busan-ipark.webp`
- `public/teams/cheonan-city.webp`
- `public/teams/chungbuk-cheongju.webp`
- `public/teams/chungnam-asan.webp`
- `public/teams/daegu.webp`
- `public/teams/gimhae.webp`
- `public/teams/gimpo.webp`
- `public/teams/gyeongnam.webp`
- `public/teams/hwaseong.webp`
- `public/teams/jeonnam.webp`
- `public/teams/paju.webp`
- `public/teams/seongnam.webp`
- `public/teams/seoul-eland.webp`
- `public/teams/suwon-bluewings.webp`
- `public/teams/suwon-fc.webp`
- `public/teams/yongin.webp`
- `scripts/verify-football-data.mjs`
- `scripts/verify-football-migration.mjs`
- `server/admin-api/lambda.ts`
- `server/next-api/provider-snapshots/route.ts`
- `server/next-api/search/route.ts`
- `src/app/(console)/data-management/page.tsx`
- `src/app/(console)/page.tsx`
- `src/app/(console)/schedules/detail/loading.tsx`
- `src/app/(console)/schedules/detail/page.tsx`
- `src/app/(console)/schedules/page.tsx`
- `src/app/(console)/squads/detail/page.tsx`
- `src/app/(console)/squads/page.tsx`
- `src/app/(console)/standings/detail/page.tsx`
- `src/app/(console)/standings/page.tsx`
- `src/app/(console)/sync/page.tsx`
- `src/app/(console)/users/page.tsx`
- `src/components/admin/league-filter.tsx`
- `src/components/admin/manual-player-form.tsx`
- `src/components/admin/manual-player-merge-form.tsx`
- `src/components/admin/verified-player-name-form.tsx`
- `src/components/clubs/club-card.tsx`
- `src/components/data-table/data-table.tsx`
- `src/components/fixtures/fixtures-table.tsx`
- `src/components/fixtures/schedule-date-time-picker.tsx`
- `src/components/fixtures/schedule-table.tsx`
- `src/components/operations/entity-override-control.tsx`
- `src/components/players/players-table.tsx`
- `src/components/players/team-players-table.tsx`
- `src/components/rankings/player-rankings.tsx`
- `src/components/sync/sync-control.tsx`
- `src/lib/admin/actions.ts`
- `src/lib/client-data.ts`
- `src/lib/data/audit.ts`
- `src/lib/data/catalog.ts`
- `src/lib/data/dashboard.ts`
- `src/lib/data/operations.ts`
- `src/lib/data/pagination.ts`
- `src/lib/data/platform-operations.ts`
- `src/lib/data/player-operations.ts`
- `src/lib/data/provider-diffs.ts`
- `src/lib/data/reports.ts`
- `src/lib/data/sync-control-options.ts`
- `src/lib/data/sync-operation-history.ts`
- `src/lib/data/types.ts`
- `src/lib/football-labels.ts`
- `src/lib/football/config.ts`
- `src/lib/operations/actions.ts`
- `src/lib/search/client.ts`
- `src/lib/sync/catalog.ts`
- `src/lib/sync/diagnostics.ts`
- `src/lib/transfers/ingestion.ts`
- `supabase/migrations/202609120001_admin_multi_league.sql`
- `tests/cloudfront-viewer-request.test.ts`
- `tests/community-notices.test.ts`
- `tests/football-leagues.test.ts`

## 후속 선수 메타데이터 보정

구단 공식 홈페이지와 한국프로축구연맹의 2026 현재 선수단을 대조해 한글명 누락 144명과 등번호 누락 79명을 보정하는 후속 마이그레이션을 추가했다. 개발 DB의 구단과 현재 공식 구단이 다른 이적 선수 6명, 코치로 전환된 이용, 현재 공식 명단에서 확인되지 않는 홍태형은 잘못된 구단 번호 입력을 막기 위해 보류했다.

- 상세 근거와 출처: `docs/qa/2026-09-12-player-metadata.md`
- 개발 DB 점검 스크립트: `scripts/audit-player-metadata.mjs`
- 후속 마이그레이션: `supabase/migrations/202609120002_complete_2026_player_metadata.sql`

## 후속 관리자 UI 및 구단 로고 조정

- 전달받은 구단 로고를 `public/teams/{team_id}.webp` 규칙으로 29개 모두 연결했다. K리그1 12개와 K리그2 17개가 같은 카탈로그를 사용한다.
- 대시보드, 선수 관리, 일정 관리의 상단 전체 리그 선택 줄을 제거했다. 세 화면의 조회 범위는 계속 K리그1·2 전체다.
- 사용자 화면의 고정 K리그1 배지를 K1/K2 전용 드롭다운으로 바꾸고 `leagueId`를 URL에 유지한다. 팀별 가입자는 K1 12개 또는 K2 17개로 전환된다.
- 사용자 응원팀 필터는 K리그1과 K리그2 그룹으로 나눠 전체 29개 구단을 제공한다.
- 개발 UI에서 대시보드 29구단·1,090명, 선수 목록 1,090명·37페이지, 일정 470경기를 확인했다. 선수 및 일정의 구단 필터와 사용자 응원팀 필터에서 29개 구단이 모두 노출되고 K2 일정 상세 링크에 `leagueId=kleague2`가 유지된다.

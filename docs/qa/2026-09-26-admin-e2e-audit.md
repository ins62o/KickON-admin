# KICKON ADMIN E2E AUDIT (2026-09-26)

최종 판정: **KICKON_ADMIN_CRITICAL_ISSUES_FOUND** → P1 2건과 P2-1(한국어 이름)은 같은 날 수정했습니다(아래 "수정 결과").

## 수정 결과 (2026-09-26, 운영 적용)

- **마이그레이션 `202609260009_admin_player_edit_integrity.sql`:** 운영에 롤백 리허설 → 단일 트랜잭션 적용 순서로 반영했고 ledger에 기록했습니다. 권한은 바뀌지 않았습니다.
  - **소속 변경:** SportsMonks 선수의 소속 변경은 `PLAYER_TEAM_CHANGE_REQUIRES_TRANSFER_WORKFLOW`로 거부합니다. 수동 선수는 지금처럼 바꿀 수 있습니다.
  - **한국어 이름:** 선수 정보 폼에서 고친 한국 이름은 확정 번역(`admin_set_verified_player_name`)으로 저장합니다. 그래서 선수단·라인업·골·푸시가 같은 이름을 씁니다. SportsMonks 선수의 한국 이름은 비울 수 없습니다.
  - **선수 삭제:** 열린 소속 기간이 있는 선수는 `PLAYER_HAS_OPEN_MEMBERSHIP`으로 거부합니다. 소속 기간을 닫으려면 제공사 관측 기록이 반드시 필요하기 때문입니다.
- **관리자 화면:** SportsMonks 선수는 소속 구단 칸을 잠그고 안내 문구를 보여 줍니다. 새 오류 코드 3개에도 안내 문구를 붙였습니다. 이 변경은 관리자 사이트 배포가 필요합니다.
- **검증**
  - DB: `admin_e2e_data_flow_test.sql` 28개 통과
  - 관리자 테스트: 150개 통과
  - 이전 결함 재현 스크립트 `11_gap_probes.sql`은 수정 전 증거로 남겨 둡니다.
- **운영 데이터:** 기존 데이터에는 영향이 없었습니다. 소속 보정 0건, 열린 소속이 있는 삭제 0건이고, 한국 이름 보정 4건은 모두 확정 번역과 같은 값입니다.

## 검증 방법과 한계

- **정적 분석 (Admin → API/RPC → DB → App → 동기화 코드)**
  - 운영 DB에서 함수·트리거 정의를 읽기 전용으로 받아 분석했습니다.
  - 관리자 RPC 41개, 관련 트리거 11개 테이블, 앱 조회 경로를 추적했습니다.
- **동적 검증**
  - 저장소 마이그레이션 전체를 재생한 **네트워크 차단 일회용 DB**에서 했습니다.
  - 관리자 호출은 `super_admin` 인증 세션, 앱 조회는 `anon` 세션, 제공사 동기화 흉내는 `service_role` 쓰기로 실행했습니다.
  - 모든 변경은 트랜잭션 롤백으로 원복했고, 테스트 후 남은 데이터는 0건입니다.
- **환경 비교**
  - 운영·Development에서 함수(공백 정규화 md5), 트리거, 실시간 publication, 읽기 권한, 환경 설정을 비교했습니다.
- **Production 쓰기: 0건.** Development 쓰기도 0건입니다.
  - Development는 Data Integrity 마이그레이션이 빠져 있어 운영과 스키마가 다릅니다.
  - 그래서 운영과 같은 마이그레이션 체인을 재생한 일회용 DB를 썼습니다.
- **iOS/Android 실제 화면은 기기 없이 확인하지 못했습니다.**
  - APP_DISPLAY는 앱 조회 코드와 매퍼 분석, `anon` 조회 결과로 판정했습니다.
  - 두 플랫폼은 같은 JS 데이터 계층(React Query + Supabase)을 씁니다. 플랫폼별 분기는 AppState 포커스 처리뿐입니다.

## Overall

| 항목 | 결과 |
|---|---|
| Admin functional coverage (축구 데이터 쓰기 기능) | 10 / 10 조사, 동적 검증 3개 흐름 |
| Admin → DB | 100% (10/10 쓰기가 실제로 반영, 거짓 성공 표시 없음) |
| DB → App | 80% (8/10) |
| Sync survival | 100% (보정 가능한 필드 전부 DB 트리거로 보호) |
| Overall (전 단계 GREEN 기능 비율) | 60% (6/10) |

## GREEN

- **경기 일정 (킥오프·경기장·직관 인증 위치)**
  - 관리자 저장 → `fixtures` 반영 → 앱 조회 반영 → 제공사 쓰기 차단 → 보정 해제 후 제공사 값 복원까지 전부 통과했습니다(A1–A9).
  - 감사 로그에 수정한 사람이 기록됩니다.
  - 직관 인증 좌표도 새 경기장을 따라갑니다(서버 기준).
- **경기 점수·상태·라운드 보정:** `protect_fixture_manual_overrides`로 보호되고 감사 기록이 남습니다.
- **순위표 보정:** `protect_standing_manual_overrides`로 11개 필드가 보호됩니다. 앱은 실시간 구독으로 반영합니다.
- **선수 기본 필드 (영문명·등번호·포지션·기록·신장·체중·생년월일)**
  - `manual_overrides`로 고정되고 선수단에 실시간 반영됩니다.
  - 감사는 `manual_overrides_audit` 트리거가 남깁니다.
- **보정 해제:** 해제 후 다음 동기화에서 제공사 값으로 돌아옵니다.
- **수동 동기화:** 관리자 API를 거쳐 Edge를 실행합니다. 오늘 K1 초기화에 실제로 사용했습니다.
- **확정 한국어 이름 (DB 경로)**
  - 선수단에 즉시 반영되고, 제공사 번역·선수단 동기화가 덮어쓰지 못합니다.
  - 새로 동기화되는 라인업에도 반영됩니다(B1–B5).
  - 단, 이 기능의 관리자 화면은 연결돼 있지 않습니다(아래 P2).
- **라인업 잘못된 ID 방지**
  - `player_id='null'` 같은 새 행은 DB 제약으로 거부됩니다(B7).
  - 기존 레거시 5건은 앱에서 "선수 정보 없음"으로 표시됩니다(`lineupMissingIdentity.test.ts`).
- **관리자 성공 표시:** RPC 결과를 확인합니다. 변경이 없으면 "변경된 항목이 없습니다"로 구분하므로 FALSE_SUCCESS_UI는 없습니다.

## BROKEN

- **선수 소속 변경:** `CRITICAL_ADMIN_DATA_INTEGRITY_BUG`
- **선수 삭제(비활성):** 소속 이력이 닫히지 않습니다.
- **선수 정보 폼의 한국어 이름:** `ADMIN_APP_SOURCE_MISMATCH`

## Important bugs

### P0
없음.

### P1

1. **소속 변경이 소속 이력을 우회합니다 (CRITICAL_ADMIN_DATA_INTEGRITY_BUG)**
   - 경로: 선수단 상세 → 선수 정보 수정 → "소속 구단" 선택 → `admin_update_player_details(p_patch.team_id)`
   - `team_players.team_id`만 바꾸고 `team_id` 보정(blocks_sync)을 남깁니다.
   - `team_player_membership_periods`와 `player_transfer_candidates`는 전혀 바뀌지 않습니다. 열린 소속 기간은 이전 팀에 남고, 현재 소속만 새 팀이 됩니다.
   - 재현: `supabase/operations/audits/20260926_admin_e2e_audit/11_gap_probes.sql`의 C1–C4. C4가 실패합니다.
2. **선수 삭제(비활성)가 소속 이력을 닫지 않습니다**
   - `admin_delete_player`는 `in_squad=false` 보정만 남기고, 열린 소속 기간은 그대로 둡니다.
   - 결과는 "비활성 선수 + 열린 소속"입니다.
   - 이후 선수단 동기화에서는 202609260007 덕분에 격리되어 실패하지 않습니다. 하지만 이력 불일치는 남습니다.

### P2

1. **관리자 화면에서 고친 한국어 이름이 선수단에만 반영됩니다 (ADMIN_APP_SOURCE_MISMATCH)**
   - 관리자 화면의 유일한 한국어 이름 입력은 선수 정보 폼이고, 선수별 보정(`team_players.display_name_ko`)으로 저장됩니다.
   - 라인업·골 이벤트·골 푸시는 번역 테이블(`football_player_localizations`)의 이름을 씁니다.
   - 재현: gap probe B10 실패 — 라인업 `홍길동`, 선수단 `폼이름`.
   - 올바른 경로인 `admin_set_verified_player_name`과 확정 이름 폼(`verified-player-name-form.tsx`)은 구현돼 있지만 어떤 페이지에도 연결돼 있지 않습니다.
2. **앱이 경기별 직관 인증 좌표·반경을 읽지 않습니다**
   - 서버(`create_gps_attendance`)는 `fixtures.attendance_*`를 우선 쓰고, 없으면 경기장 좌표를 씁니다. 반경 기본값은 300m입니다.
   - 앱 사전 판정(`evaluateAttendanceEligibility`)은 경기장 좌표와 300m 상수만 씁니다.
   - 관리자 화면은 반경 50–5000m와 임의 좌표를 허용합니다.
   - 운영의 현재 데이터 929건은 모두 경기장 좌표와 같고 반경도 전부 300m라서, 지금은 영향이 없는 잠재 결함입니다.
3. **연결되지 않은 관리자 기능:** 백엔드는 있지만 화면이 없습니다.
   - `verified-player-name-form.tsx`
   - `player-change-review-form.tsx`
   - `cron-maintenance-control.tsx`
   - `applyPlayerOverrideAction` / `releasePlayerOverrideAction` (선수 보정 해제 UI 없음)
4. **ENVIRONMENT_DRIFT (Development가 운영보다 뒤처짐)**
   - Data Integrity 계열 함수 19개가 Development에 없습니다.
   - 0007(수동 보정 격리)과 0008(직관 알림)도 Development에 없습니다.
   - `match_prediction_open` 마감 시각이 다릅니다: 운영은 킥오프 10분 전, Development는 킥오프 시각.
   - 관리자 RPC·트리거·실시간 publication·읽기 권한은 두 환경이 같습니다.

### P3

1. **잘못 종료된 경기 상태를 되돌리면 앱에 늦게 반영될 수 있습니다**
   - 앱의 `mergeCanonicalFixture`는 FINISHED/CANCELED → SCHEDULED/LIVE 변경을 막습니다.
   - 관리자가 상태를 되돌려도, 캐시가 남아 있는 기기는 영속 캐시가 만료될 때까지(최대 24시간) 이전 상태를 볼 수 있습니다.
2. **보정 정책 문서화 필요**
   - 모든 보호 트리거가 `blocks_sync` 값과 관계없이 해제되지 않은 보정을 적용합니다. 즉 `blocks_sync`는 표시용입니다.
   - 보정은 만료되지 않으므로, 예를 들어 관리자가 고친 득점 기록은 해제하기 전까지 자동 갱신되지 않습니다.
   - 정책은 존재합니다(MANUAL_OVERRIDE_POLICY_MISSING 아님). 다만 관리자 화면에 "해제 전까지 동기화 중지"라는 안내가 필요합니다.
3. **이미 저장된 라인업과 골 이벤트는 이름 변경 후에도 당시 이름을 유지합니다**
   - 설계 의도입니다(`apply_football_player_localization` 주석, B6).
   - 운영자가 과거 경기 이름까지 바뀔 것으로 기대하면 혼동할 수 있습니다.

## Feature matrix

| 관리자 기능 | DB 결과 | 앱 결과 | 동기화 후 | 판정 |
|---|---|---|---|---|
| 경기 킥오프·경기장·인증 위치 | `fixtures` + `manual_overrides` + 감사 | 즉시 조회 반영, 실시간 무효화 | 보호됨, 해제 후 제공사 값 | GREEN |
| 경기 점수·상태·라운드 | `fixtures` + 보정 + 감사 | 반영 (상태 되돌림은 P3) | 보호됨 | GREEN |
| 순위표 보정 | `league_standings` + 보정 + 감사 | 실시간 반영 | 보호됨 | GREEN |
| 선수 영문명·등번호·포지션·기록 | `team_players` + 보정 + 감사 | 선수단 실시간 반영 | 보호됨 | GREEN |
| 선수 한국어 이름 (선수 정보 폼) | `team_players` 보정만 | 선수단만 반영, 라인업·골·푸시 미반영 | 보호됨 | P2 |
| 선수 소속 변경 | 현재 소속만 변경 | 새 팀 선수단에 표시 | 보호됨 (소속 이력 불일치) | **P1** |
| 선수 삭제(비활성) | `in_squad=false` 보정, 소속 열린 채 | 선수단에서 숨김 | 격리됨 (0007) | **P1** |
| 수동 선수 등록·병합 | 번역·수동 기록·감사 | 선수단 반영 (정적 분석) | `MANUAL` 선수는 동기화 대상 외 | 정적 GREEN |
| 보정 해제 (경기·순위) | 해제 + 감사 | 다음 동기화 후 제공사 값 | 제공사 값 복원 | GREEN |
| 수동 동기화 | Edge 실행 + `sync_runs` | 동기화 결과 반영 | — | GREEN |

## App refresh behavior

| 데이터 | 반영 시점 | 근거 |
|---|---|---|
| 경기 킥오프·경기장·점수·상태 | REALTIME (로그인) / ON_REOPEN | `fixtures` publication + `refetchOnMount/Focus: always` |
| 선수단 (이름·등번호·소속) | REALTIME (로그인) / ON_REFRESH | `team_players` publication, staleTime 2분 |
| 순위표 | REALTIME (로그인) / ON_REFRESH | `league_standings` publication |
| 라인업 | ON_REFRESH | 실시간 구독 없음, staleTime 2분 |
| 경기 상태 되돌림 | STALE_UNTIL_CACHE_EXPIRE (최대 24시간) | `mergeCanonicalFixture` |
| 비로그인 사용자 | ON_REFRESH / ON_REOPEN | 실시간 구독은 로그인 사용자만 |

## Provider overwrite risks

| 필드 | 관리자 쓰기 | 제공사 동기화 | 앱 읽기 | 덮어쓰기 가능? | 수동 보정 | 결과 |
|---|---|---|---|---|---|---|
| 경기 킥오프 | 일정 수정 / 경기 보정 | live, post-match, full | `fixtures.kickoff_at` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 경기장 | 일정 수정 | full | `fixtures.stadium_id` → `stadiums` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 경기 상태 | 경기 보정 | live, post-match | `fixtures.status` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 점수 | 경기 보정 | live, post-match | `fixtures.home/away_score` | 아니오 (골 이벤트는 별도로 계속 갱신) | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 팀 (팀명) | 없음 | full | `teams` | 해당 없음 | 없음 | PROVIDER_AUTHORITATIVE |
| 선수 한국어 이름 (확정 이름) | RPC 있음, UI 없음 | squad, live, localization | `team_players` / `fixture_lineup_players` / `goal_events` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 선수 한국어 이름 (폼) | 선수 정보 폼 | squad | `team_players.display_name_ko` | 선수단은 아니오, 라인업·골은 번역 테이블 값 | 부분 | ADMIN_APP_SOURCE_MISMATCH |
| 등번호·포지션 | 선수 정보 폼 | squad | `team_players` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |
| 선수 현재 소속 | 선수 정보 폼 | squad (membership) | `team_players.team_id` | 아니오 (이력 불일치) | 지원 | **CRITICAL** |
| 라인업 | 없음 | lineup sync | `fixture_lineup_players` | 해당 없음 | 없음 | PROVIDER_AUTHORITATIVE |
| 골 이벤트 | 없음 | live, post-match | `fixtures.goal_events` | 해당 없음 | 없음 | PROVIDER_AUTHORITATIVE |
| 순위표 | 순위 보정 | full, team-metrics | `league_standings` | 아니오 | 지원 | MANUAL_OVERRIDE_PROTECTED |

- 동기화 코드에 트리거 우회(`session_replication_role`, `disable trigger`)는 없습니다.

## Environment wiring

- **Development**
  - 관리자 `.env.development.local` → `uvsmyftwwucrvoteajpi`
  - 앱 `.env.development.example` → `uvsmyftwwucrvoteajpi`
- **Production**
  - 관리자 `.env.production.local` → `smihjaucucffmsbktnmp` (`KICKON_ENVIRONMENT=production`)
  - 앱 `.env` → `smihjaucucffmsbktnmp`
- **콘솔 환경 전환**
  - 브라우저 안에서 환경을 전환합니다(localStorage `kickon-console-environment`).
  - 관리자 쓰기 함수는 같은 브라우저 클라이언트(`getBrowserSupabaseClient`)를 써서 화면과 같은 환경으로 갑니다.
  - 잘못된 환경 연결은 없습니다.
- **한계:** 배포된 admin.kickon.kr의 Vercel 환경 변수는 CLI 권한이 없어 확인하지 못했습니다. 로컬 운영 설정 기준입니다.

## 자동화 테스트 (이번에 추가)

- `app/supabase/tests/database/admin_e2e_data_flow_test.sql`: 16개 모두 통과
  - 경기 일정 A1–A9
  - 확정 한국어 이름 B1–B6
  - 라인업 `'null'` 거부 B7
- `app/supabase/operations/audits/20260926_admin_e2e_audit/11_gap_probes.sql`: 결함 재현용. 고치기 전까지 B10과 C4가 실패하는 것이 정상입니다.
- 모두 트랜잭션 롤백이라 운영을 수정하지 않습니다. `scripts/fresh-db-bootstrap.sh`로 반복 실행할 수 있습니다.

## Production mutation required

없습니다. 발견한 결함은 모두 코드 수준이고, 운영 쓰기 없이 재현했습니다. 기기 화면 확인은 운영 쓰기 없이 Development 앱 빌드로 할 수 있습니다.

## 권장 수정 (별도 승인 후)

1. **소속 변경:** 선수 정보 폼에서 소속 구단 선택을 없애거나 막습니다(`admin_update_player_details`가 `team_id`를 거부). 소속 변경은 이적 후보 → 승인·적용 경로로만 하게 합니다.
2. **선수 삭제:** 열린 소속 기간을 관리자 기록 주체로 닫거나, legacy exit 경로로 처리합니다.
3. **한국어 이름:** 선수 정보 폼의 한국어 이름 저장을 `admin_set_verified_player_name`로 바꾸고, 확정 이름 폼을 선수 상세에 연결합니다.
4. **앱:** 직관 사전 판정이 `fixtures.attendance_*`(좌표·반경)를 쓰도록 매퍼와 판정 로직을 바꿉니다.
5. **관리자 화면:** 수동 보정마다 "해제 전까지 자동 동기화 중지" 안내를 넣고, 선수 보정 해제 UI를 연결합니다.

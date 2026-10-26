# KICKON Admin Migration 및 유지보수 기준선 관리 방침

기준일: 2026-10-26 KST

상태: **보존·관리 원칙 문서화 완료 / Migration 권위 원본·발행 책임자·실제 적용 이력 미확정**

이 문서는 승인된 관리 방침 기록이다. SQL 실행, 삭제, 배포, 권한 변경 또는 전체 운영 안정성에 대한 승인이 아니다. 기존 PAUSED/HOLD/NO-GO/UNKNOWN 및 종료된 승인 상태를 변경하지 않는다.

## 1. 구분해야 하는 세 가지 원본

| 구분 | 확인된 범위 | 취급 원칙 |
|---|---|---|
| 기존 Admin 역사적 원본 | HEAD `266bee578e7bc0236f065c1307ea2cce64e7415f`의 Migration 152개. 현재 작업 트리에서는 삭제 상태 | HEAD 및 A의 `head/supabase/migrations/`에서 역사적 원본으로 보존한다. 현재 디렉터리로 자동 복원하지 않는다 |
| 현재 Admin 증분 | 현재 `supabase/migrations/`의 29개 | 기존 DB 객체를 전제로 한 증분이다. 152개를 대체하는 독립 초기화 이력이나 전체 스키마로 취급하지 않는다 |
| App 비교 자료 | 조사 기준 App HEAD `a712e7397741d5c397d7643fa6144155222c8018` 및 당시 로컬 파일 | 교차 확인 자료다. 같은 이름·객체가 있어도 이관 승인, 동일 소유권, 동일 적용 상태를 뜻하지 않는다 |

현재 Admin 코드와 증분 SQL은 기존 `profiles`, `admin_users`, `admin_audit_logs`, `manual_overrides`, `fixtures`, 관리자 조회·권한 함수 등에 의존한다. 현재 29개만으로 이 의존성이 모두 정의되지는 않는다. 이는 정적 의존성 확인이며 현재 운영 DB의 장애를 확인한 결과가 아니다.

152개 원본과 같은 이름의 App 파일을 비교한 결과는 바이트 동일 52개, 바이트 차이 93개, 동일 이름 없음 7개였다. 차이 93개에는 빈 줄만 다른 75개, 빈 줄·줄 주석만 다른 7개, 그 외 차이 11개가 포함된다. 마지막 11개 중 9개는 아래 Historical 실행문 차이, 2개는 세미콜론 한 줄 차이다. 이 수치를 SQL 전체의 의미 동등성이나 실제 적용 성공으로 확대하지 않는다.

## 2. 보존 및 소유권 원칙

- 역사적 원본은 원본 저장소·HEAD·버전·파일명·SHA를 함께 보존한다. 같은 객체의 최신 정의만 남기고 과거 이력을 제거하지 않는다
- 이미 실행됐거나 no-op으로 보존된 버전의 본문을 고치지 않는다. 날짜·이름·해시의 유사성만으로 중복 삭제하지 않는다
- 현재 29개 증분과 이전 152개를 자동 병합·복원·재번호 부여하지 않는다. App 파일로 일괄 교체하지 않는다
- 버전 충돌은 `저장소 + 버전 + 파일명 + SHA`로 분리해 관리한다. 서로 다른 변경을 하나의 버전으로 합치지 않는다
- 실제 DB 환경별 적용 이력과 함수·스키마 계약을 확인하기 전에는 어느 저장소도 권위 원본으로 지정하지 않는다
- 공유 DB Migration의 단일 발행 책임자가 필요하다. 여러 저장소가 독립적으로 같은 버전을 발행하면 적용 이력과 실행 책임을 추적할 수 없기 때문이다
- 발행 책임자, 권위 저장소·ref, 환경별 적용 기준, 충돌 해소 방식은 현재 **미정**이다. 이 문서가 특정 사람·AI·Admin·App에 그 역할을 부여하지 않는다
- 책임자와 권위 원본은 정확한 변경 이력·실제 적용 근거·명시적 승인으로 정한다. 사후에 원본을 수정해 적용 이력을 맞추지 않는다

## 3. App·Admin 버전 충돌 4건

아래는 파일 버전 충돌이며, 실제 운영 DB의 중복 적용이나 손상을 확인했다는 뜻은 아니다.

| 버전 | Admin HEAD 파일 | App 비교 파일 |
|---|---|---|
| `202609100003` | `202609100003_use_incheon_for_league_notice_storage.sql` | `202609100003_k_league_2_2026.sql` |
| `202609100004` | `202609100004_use_official_notice_author_profile.sql` | `202609100004_hwaseong_home_stadium.sql` |
| `202609120004` | `202609120004_clear_invalid_k2_squad_sync_errors.sql` | `202609120004_remote_team_emoticons.sql` |
| `202609190001` | `202609190001_public_team_fan_counts.sql` | `202609190001_reject_invalid_lineup_player_ids.sql` |

원본을 자동 재번호 부여하거나 실제 DB의 Migration 이력을 덮어쓰는 방식으로 해소하지 않는다. 단일 발행 책임자가 환경별 적용 근거를 확인한 뒤 별도 승인된 정방향 변경 계획을 수립해야 한다.

## 4. Historical 실행문 차이 9건

```text
202608290020_post_match_and_history_sync.sql
202608290022_start_historical_backfill.sql
202608290023_retry_historical_backfill.sql
202608290025_retry_historical_backfill_with_diagnostics.sql
202608290027_retry_historical_backfill_by_stage.sql
202608290028_retry_historical_backfill_with_function_url.sql
202608290029_football_provider_team_catalog.sql
202608290030_retry_historical_backfill_after_team_mapping.sql
202608290031_retry_current_season_player_data.sql
```

일부 Admin 원본은 no-op 버전으로 보존돼 있고, 다른 파일은 정의를 유지하면서 자동 호출 부분을 제거한 형태다. 같은 이름의 App 파일에는 `invoke_initial_football_history_backfill()` 호출 또는 동기화 상태 변경이 포함된다. 9개 전체가 동일한 no-op 파일이라는 뜻은 아니다.

이 파일들은 복사·합치기·재실행 대상으로 취급하지 않는다. 호출을 복원하면 과거 적재나 상태 변경을 다시 시작할 수 있다. 과거 실행 기록의 존재도 새로운 실행 승인으로 사용하지 않는다.

## 5. 백업 계층과 복구 순서

### 보존 계층

- **A / 01:** `/Users/inseong/MINE/kickon-archives/admin/stabilization-20261026-01/`
  - 당시 현재 파일 2,983개와 HEAD 원본 517개의 스냅샷
  - HEAD Migration 152개와 당시 현재 Migration 29개 포함
  - Manifest SHA-256: `bf1106e63d11595e9d0d3bc039f4f4bf1308df45f0d492ad38da94b672eafcca`
- **증분 / 02:** `/Users/inseong/MINE/kickon-archives/admin/stabilization-20261026-02/`
  - 아래 6개 파일만 보존하며 기존 A 백업을 다시 만들거나 수정하지 않는다
  - Manifest SHA-256: `48fad81330206f2af79330ae61c9508a0e55c2a083da3642d85f9ca7bcc58288`

```text
AGENTS.md
package.json
package-lock.json
supabase/functions/_shared/lineupPlayers.ts
tests/diagnostics/lineup-baseline.mjs
tests/sql/lineup-baseline.sql
```

A는 C 규칙 정비 전의 작업 트리다. A의 `worktree`만 복원하면 최신 규칙·이름과 라인업 role 수정이 되돌아갈 수 있으므로 02 증분이 필요하다. 미추적 B 테스트는 HEAD만으로 복구할 수 없다.

### 승인된 격리 검증과 실제 복구의 구분

1. 원본 Manifest·HEAD·승인 범위를 확인한다
2. **별도 임시 경로**에 A의 `worktree`만 복원한다
3. 같은 상대 경로로 02의 6파일을 덧씌운다. B 테스트 2개는 신규 추가다
4. 결합된 2,985파일의 경로 집합과 SHA를 검증한다
5. 검증용 임시 복원본만 제거한다. 현재 작업 트리에는 쓰지 않는다

이번 승인으로 위 격리 순서의 검증을 완료했다. A의 `head`는 역사적 증거이며 활성 소스에 통째로 덧씌우지 않았다. 실제 작업 트리 덮어쓰기·DB 복구·배포는 별도 승인 대상이다.

백업 디렉터리는 0700, 일반 파일은 0600으로 보존한다. 전체 Git 객체·이력 백업은 아니며 환경 파일·Secret·SQLite/WAL/SHM·Git 밖 실제 영수증·의존성·dist를 자동 포함하지 않는다. 실행 중 SQLite를 단순 파일 복사하지 않는다.

**이 문서 자체는 승인된 6파일 증분의 대상이 아니다.** 따라서 2,985파일 복원 검증은 이 문서 생성 전 승인된 소스 집합에 한정한다. 이 문서를 포함한 이후 기준선 보존·Git 반영은 별도 범위를 정해야 한다.

## 6. 라인업 도메인 정책과 Writer 보호

### 완료된 로컬 수정의 의미

중복 키에 `player.role`을 복원하여 보존된 DB 기본키 `(fixture_id, team_id, player_id, role)`와 일치시켰다. 서비스 파일은 기존 HEAD와 바이트가 같고 SHA-256은 `315f68e2670d0811f8d003d4f740625d1d392a6ddb82694c5089826ec46b3550`이다.

이전 승인 범위의 합성·격리 검증에서 Node 10 PASS / 0 FAIL 및 PostgreSQL 15개 사례의 기대 결과 일치를 확인했다. 이번 문서화 작업에서 검사를 다시 실행하지 않았다. 운영 DB·실제 공급자·실제 알림의 정상성을 입증한 결과가 아니다.

같은 선수가 STARTER와 SUBSTITUTE로 동시에 전달되는 것이 도메인상 유효한지는 **미결정**이다. 다음 정책 중 어느 것도 이 문서로 새로 승인하지 않는다.

- 두 role 보존: DB 계약과 호환되지만 이중 표시·집계 의미를 결정해야 한다
- 충돌한 발행 전체 거절: 임의 선택을 피하고 기존 데이터를 보존하지만 갱신 지연·검토 절차가 필요하다
- 신뢰 가능한 공급자 규칙으로 선택: 명확한 근거가 필요하며 입력 순서나 추측으로 role을 선택하지 않는다

### 기존 보호와 확인되지 않은 경계

- Admin maintenance client에는 owner·generation·heartbeat·lease 상실 처리와 `_expected` 전달이 있다
- 보존된 App Migration에는 live lease의 owner·generation 검사와 라인업 hash·변경 marker·append-only 버전 이력이 있다. 로컬 정의의 존재를 Hosted 적용 근거로 바꾸지 않는다
- 현재 Admin의 라인업 발행 helper는 fixture·lineups·players만 전달한다. 최종 라인업 쓰기까지 maintenance 세대 또는 예상 revision이 연결되는지는 별도 검증 대상이다
- B의 HEAD 계약 검사는 행 잠금·롤백·작업 격리를 확인했지만, 나중의 유효한 과거 payload가 수락되는 한계도 확인했다. 상위 시스템 전체에 보호가 없다는 결론은 아니다
- 버전 이력 저장은 stale payload 거절과 다르다. 클라이언트의 `assertAlive()`만 추가해도 최종 쓰기 직전 경쟁을 완전히 막지 못한다
- 개선 시 기존 lease·revision 구조를 먼저 재사용해야 한다. maintenance 세대를 live lease 세대로 대신 전달하거나 중복 보호 시스템을 만들지 않는다
- 공급자 조회 전 확보한 revision을 DB의 같은 잠금·트랜잭션에서 대조하는 방향을 검토하되, 현행 권위 SQL 계약을 확인하기 전 서비스·Migration을 수정하지 않는다
- 로컬 수집 시각 `fetched_at`은 신뢰 가능한 공급자 revision의 대체물이 아니다

## 7. 승인 전 금지와 후속 결정

다음은 이 문서화·증분 보존 승인에 포함되지 않는다.

- Production Writer 계약 SQL POST 또는 다른 운영/Development DB·API 조회
- Migration 복원·병합·재번호·실행·적용 이력 변경
- 서비스 코드 추가 수정, 권한 변경, Edge/Admin/AWS/CloudFront 배포
- 실제 푸시·Provider·Wake·Retry·데이터 적재·재처리
- D 후보 7파일 또는 다른 기존 자료의 삭제·이동
- Git stage·commit·push·reset·clean·restore, worktree prune, Git GC
- 운영 C/A·복구·승인·Manifest·기존 SHA 기록 및 PAUSED/HOLD/NO-GO/UNKNOWN 상태 변경

후속 결정은 단일 발행 책임자와 권위 이력 확정, 버전 충돌·Historical 실행 차이 처리, 라인업 도메인 정책, 현행 Writer 계약 확인이다. 각각 정확한 파일·대상·위험·검증·복구·승인 범위를 별도로 정한다.

## 8. 현재 완료 범위

증분 6파일 보존과 관리 방침 문서화만 완료 범위다. 실제 서비스 안정성 전체, Migration 재현 가능성 전체, Writer freshness 보호, 실사용자 푸시 개선 또는 최종 Git 기준선 확정을 완료했다고 선언하지 않는다.

운영 푸시 C의 기존 적용 기록·실제 표본 N=1·+10분 건강 UNKNOWN과 별도 E 승인 조건은 기존 자료 그대로 유지한다. 이 문서는 과거 승인을 재사용하거나 E를 자동 실행하는 근거가 아니다.

## 9. 보존 경로와 실행 경계

위 1~8절은 2026-10-26 보존 당시 기록이다. 이 절은 ADMIN-HISTORY-QUARANTINE-20261027-02-PRIVACY의 보존 경로 관리 원칙이며 기존 승인·실행 상태를 갱신하지 않는다.

- 전체501개 중 Git 보존475개는 preserved/admin/의 출처별 경로에 원문 SHA 그대로 보존한다. 개인정보·QA 검토 보류26개는 기존01백업의 원문·SHA·복구 경로로 보존하고 신규 Git 추적에서 제외한다
- 코드·SQL·스타일의 .txt 접미사는 보존 표현이며 새로운 Migration 버전이나 실행 이력이 아니다
- REVIEW268개는 Git264개와 기존 외부 원본4개로 나누어 기능 동등성 확인 전 보존한다. 원래 경로와 복구 SHA는 manifest에 남기며 폐기 승인으로 사용하지 않는다
- 승인된 실행 Migration 영역에는 README만 둔다. 역사152개·증분29개를 자동 탐색 경로에 다시 넣지 않는다
- 버전 충돌4건과 Historical 실행문 차이9건, 실제 DB 적용 이력·권위 원본·단일 발행 책임자 미확정 상태를 유지한다
- 개인정보 보류26개의 Git 제외는 원문 삭제·비식별화·기능 폐기가 아니다. Production QA·배포 증거는 별도 보호하고 일반 QA 결과도 이번에 삭제하지 않는다
- 나머지 미추적23개는 원래 위치와 검증된 기존01백업에 보존하고 정확한 ignore 경로로 Git 추가에서 제외한다
- 실제 Secret·SQLite·현행 운영 영수증·승인/복구 패킷은 이동하거나 추가하지 않는다
- 명시적 SQL 실행·수동 CLI 사용까지 기술적으로 봉쇄한 것은 아니다. DB 작업은 권위 이력이 검증된 별도 작업 영역과 새로운 승인이 필요하다
- 현재 React/Vite 코드·TypeScript/test/lint/Tailwind 경계·CI는 source commit ab62678cabbbd1bb723532eeed7bfda49fe46a1f 그대로 유지한다

이 구조는 보존을 위한 것이며 전체 DB 재현, Writer 최신성 보호, 이중 role 정책, 원격 보호 정책 또는 실사용자 푸시 개선의 완료 선언이 아니다.

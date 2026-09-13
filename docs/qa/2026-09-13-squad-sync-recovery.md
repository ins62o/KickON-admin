# 2026-09-13 전체 리그 동기화 경고 복구

## 원인

- 04:10 KST 자동 작업은 K1·K2 리그를 정확히 전달했지만, 배포된 `sync-team-squad` v9가 요청 범위를 무시하고 시즌 `26894`, 리그 `kleague`를 사용했다.
- K2 17개 구단이 잘못된 시즌으로 요청되어 개발·운영 모두 실패했다. 과거 오류만 지우는 마이그레이션으로는 다음 자동 실행의 재발을 막을 수 없었다.
- 전체 데이터 동기화의 과거 HTTP 400/401/timeout 실행은 이미 후속 성공으로 복구돼 대시보드 RPC 실패 수가 0이었다. 이번 경고는 별도 `football_sync_state` 실패였다.
- 관리자 수동 선수단 요청도 기존 앱 호환용 `server-managed` 응답을 실제 갱신 성공으로 취급하고 있었다.

## 수정

- 이 저장소에서 실제 배포된 선수단 함수 소스를 관리한다. `league_standings`로 구단의 소속을 확인하고 `football_provider_seasons`에서 해당 리그·시즌의 공급자 시즌을 읽는다.
- 요청의 리그·시즌·공급자 ID가 충돌하면 외부 호출 전에 거절한다. 공급자 응답의 구단 ID도 검증한다.
- 선수·득점·실행 상태는 동일한 리그·시즌으로 기록한다. 신규 상태 키는 `team-squad-{season}-{team}:{season}:{league}`다.
- 선수 누락을 삭제/비활성화하지 않는 기존 보완 저장과 검증된 한글명/DB 수동 잠금 보호를 유지한다.
- 실제 데이터 저장과 상태 저장 성공 후에만 같은 구단의 이전 오류를 해제한다. 진행 중·실패 작업을 성공 처리하지 않는다.
- 수동 갱신은 관리자 API 권한 확인 후 서버 동기화 secret으로 실제 실행하며, `synced` 응답만 성공 처리한다. 일반 앱 호출은 여전히 DB 조회 방식이다.
- 개발 실동작 중 29개 요청 중 하나가 Supabase `503 BOOT_ERROR`로 시작하지 못했다. 매일 04:15~04:40 KST, 5분 간격으로 해당 일일 주기의 미완료 구단만 최대 6회 재시도한다. 완료 구단에는 공급자 요청을 보내지 않는다.

## 검증

- Node 실행 테스트 92개, ESLint, TypeScript, 정적 사이트 빌드, 관리자 API 빌드 통과.
- `deno check supabase/functions/sync-team-squad/index.ts` 통과.
- 실제 자동 작업 재실행: 개발 29개 중 28개 완료 후 누락 1개만 재시도하여 전체 완료.
- DB 통합 테스트 `supabase/tests/squad-retry.sql`: 정상 작업 0개, 실패/시작 누락/오래된 성공 각각 1개 재시도. 트랜잭션 롤백으로 테스트 변경과 HTTP 큐를 남기지 않는다.
- 개발·운영 각각 선수 1,090행을 전후 대조: 삭제 0, 한글명 변경 0, 비활성화 0. 운영의 기존 비활성 선수 1명도 유지.
- 운영 09:35 KST 자동 작업: 29/29 성공, 미복구 실패 0, 대시보드 실패 0. 재호출 시 불필요한 요청 0.
- 실제 운영 대시보드 새로고침 후 데이터 동기화 관리 ‘정상’ 확인.
- 원격 `202609130001`은 모바일 라인업 마이그레이션이므로 이 작업은 충돌 없는 `202609130002`로 기록.

## 배포와 운영 확인

웹/Lambda는 기존 `Prod` GitHub Actions로 배포된다. Supabase Edge Function과 SQL은 별도 배포 대상이므로 이 함수 변경을 웹 배포만으로 완료 처리하지 않는다. 다른 저장소의 구형 함수로 덮어쓰지 않는다.

1. 개발에 함수 배포: `supabase functions deploy sync-team-squad --project-ref uvsmyftwwucrvoteajpi --use-api --no-verify-jwt`
2. 원격 선행 스키마를 확인한 뒤 `202609130002_retry_incomplete_squad_sync.sql`만 적용하고 마이그레이션 이력을 기록한다.
3. 실제 DB 작업 `select public.invoke_scheduled_team_squad_sync()`를 실행한다. 반환값은 완료 수가 아니라 큐에 넣은 구단 수다.
4. 실행 시각을 기록하고 `node scripts/verify-squad-sync.mjs --environment development --since <ISO시각>`으로 모든 구단의 새 성공과 실패 0건을 확인한다.
5. 개발 검증 후 운영 프로젝트 `smihjaucucffmsbktnmp`에 같은 순서로 적용하고 `--environment production`으로 확인한다.
6. 운영 대시보드 새로고침 후 ‘데이터 동기화 관리’의 ‘정상’을 확인한다.

`--no-verify-jwt`는 기존 설정을 유지한다. 함수 내부에서 scheduler secret 또는 실제 앱 사용자 인증을 검사하며, 인증된 앱 사용자도 공급자 호출이나 DB 변경을 실행할 수 없다.

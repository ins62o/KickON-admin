# 앱 업데이트 저장 취소

데이터 관리 → 앱 업데이트의 각 플랫폼 폼에 입력 취소와 저장 취소를 추가했다.

- 입력 취소: 저장하지 않은 입력을 현재 서버 설정으로 되돌린다.
- 저장 취소: 플랫폼의 마지막 저장을 이전 버전/안내 상태로 복원한다. 처음 등록한 설정은 해당 버전을 유지하고 안내를 끈다. 취소를 다시 취소하는 동작은 제공하지 않는다.
- 취소 확인 창에서 취소 사유 3~1,000자를 입력한다. 관리자/최고 관리자만 가능하다.
- 새 `admin_cancel_app_store_release(text,bigint,text)` RPC가 기존 플랫폼별 advisory lock을 획득하고 최신 감사 ID 및 전체 현재 설정을 비교한다. 다른 저장이 진행되거나 완료된 경우 오래된 취소 요청을 거부한다.
- 복원은 기존 `admin_set_app_store_release`를 사용한다. 같은 트랜잭션에서 감사 작업을 `APP_RELEASE_CANCEL`로 기록하여 작업자·역할·사유·변경 전후 값을 유지한다.

개발 DB `uvsmyftwwucrvoteajpi`에 `202609170001_cancel_app_store_release.sql`의 RPC 및 실행 권한을 SQL Editor로 적용하고 PostgREST 스키마를 갱신했다. 이번 수동 적용은 migration 이력 테이블에 등록하지 않았으므로 실제 함수 적용과 이력 등록을 구분해야 한다. 운영 DB에는 적용하지 않았다.

검증: 어드민 테스트 113개, lint, typecheck, 개발 정적 빌드 통과. 실제 개발 DB 트랜잭션에서 복원·감사·사유 검증·비관리자/오래된 이력/다른 플랫폼/중복 취소 차단 통과. 첫 등록 조건은 트랜잭션 내부에서 before_value=null인 fixture로 검증했다. 모두 롤백했다. 재현 SQL은 `supabase/manual/verify_app_release_cancel.sql`이다.

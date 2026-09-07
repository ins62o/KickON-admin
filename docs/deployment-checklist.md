# KickON Data Center 배포 체크리스트

## 1. 마이그레이션 이력 감사

- 모바일 저장소와 관리자 저장소의 `202608300001`~`202608300007` SQL이 서로 다른 내용인지 확인한다.
- 원격 `supabase_migrations.schema_migrations`와 실제 테이블·함수·정책을 함께 비교한다.
- 이미 적용된 버전을 파일명만 보고 재적용하거나 완료로 간주하지 않는다.
- 이 저장소의 관리자 migration `202609050001`~`202609050013`, `202609070001`~`202609070003`과 원격 객체의 차이를 개발 프로젝트에서 먼저 검토한다.

## 2. 개발 Supabase 적용

- 개발 프로젝트를 백업하거나 복구 지점을 만든다.
- `202609050001_admin_operations.sql`부터 `202609070003_fixture_schedule_edit.sql`까지 파일명 순서대로 리뷰하고 적용한다.
- `202609050013` 적용 뒤 `system.read` 관리자와 service role만 `admin_get_usage_snapshot()`·`admin_get_storage_usage()`를 실행할 수 있는지 확인한다.
- 개발 콘솔에서 DB 크기, Storage 전체/이번 달/버킷 합계가 실제 값으로 표시되고 객체 경로가 aggregate RPC 응답에 포함되지 않는지 확인한다.
- 기존 모바일 조회/작성 정책이 유지되는지 확인한다.
- 숨김 콘텐츠가 일반 사용자 조회에서 제외되고 작성자·관리자 계약이 의도대로인지 확인한다.
- 정지 사용자의 게시글·댓글·응원·좋아요·게시 이미지 업로드가 차단되는지 확인한다.
- 수동 선수와 잠금 값이 동기화 후에도 유지되는지 확인한다.
- 선수 삭제 후 선수 관리·구단 명단·검색에서 제외되고, 선수 동기화 뒤에도 복구되지 않으며 감사 로그가 남는지 확인한다.
- 일정 관리에서 경기 날짜와 경기장을 바꾼 뒤 인증 날짜·좌표·반경이 즉시 반영되고, 경기 동기화 뒤에도 `kickoff_at`, `stadium_id`와 인증 기준이 유지되는지 확인한다.
- `create_gps_attendance()`가 경기별 좌표를 우선 사용하고 값이 없을 때만 선택된 경기장의 좌표를 사용하는지 확인한다.

## 3. 관리자 부트스트랩

- Supabase Auth에서 관리자 사용자를 만든다.
- 서비스 역할을 사용하는 서버/SQL 관리 경계에서 첫 `super_admin`을 `admin_users`에 등록한다.
- 공개 회원가입이나 브라우저 publishable key로 관리자 역할을 부여하지 않는다.
- `support`, `moderator`, `data_editor` 테스트 계정을 각각 만들고 메뉴와 RPC 권한을 검증한다.

## 4. 환경 변수

- `.env.example`의 서버 전용 값이 클라이언트 번들에 포함되지 않았는지 확인한다.
- DB와 Storage 한도를 각각 설정한다.
- 하나의 정적 번들에 개발·운영 `NEXT_PUBLIC_KICKON_*_SUPABASE_*`와 환경별 `..._ADMIN_API_BASE_URL`이 모두 설정되었는지 확인한다. 환경 전환용 별도 관리자 사이트 URL은 사용하지 않는다.
- GitHub `production` Environment의 공개 빌드 변수에 localhost 주소가 없는지 확인한다.
- 개발·운영 관리자 API Lambda를 분리하고 각 함수에 해당 Supabase URL·publishable key·Metrics secret만 설정한다.
- 두 Lambda의 `ADMIN_ALLOWED_ORIGINS`에 실제 관리자 콘솔 origin을 지정한다.
- S3/CloudFront가 운영 배포 기준이면 Vercel Git 자동 배포를 함께 켜 두지 않는다.

## 5. 회귀 검증

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:admin-api`를 통과한다.
- 로그인·로그아웃·비활성 관리자 차단을 확인한다.
- 새로고침과 개발↔운영 전환 중 헤더·푸터가 유지되고 전체 화면 점멸이나 이전 환경 데이터 노출이 없는지 확인한다.
- 개발·운영 각각에서 DB·Storage aggregate가 표시되는지 확인하고, 선택적 Metrics/Storage 상세 API를 끈 상태에서도 핵심 합계가 유지되는지 확인한다.
- 문의 답변, 사용자 경고/정지/해제, 신고 상태, 숨김/복원, 선수·순위 보정, 동기화 실행의 감사 로그를 확인한다.
- 모바일 앱에서 게시글·댓글·경기 응원·선수단·순위 핵심 흐름을 회귀 테스트한다.
- 다크/라이트, 키보드 탐색, 포커스, 빈 상태, 오류 상태를 확인한다.

## 6. 운영 승격

- [GitHub Actions 자동 배포](github-actions-deployment.md)에 따라 `production` Environment, OIDC 역할, S3/CloudFront와 개발·운영 Lambda 변수를 구성한다.
- 개발 환경 검증 결과와 SQL diff를 별도 승인받는다.
- 운영 DB 백업과 롤백 절차를 준비한다.
- 낮은 트래픽 시간에 적용하고 모바일 쿼리·RLS 오류·동기화 실패를 모니터링한다.
- 이 저장소 작업만으로 운영 배포가 승인된 것으로 간주하지 않는다.

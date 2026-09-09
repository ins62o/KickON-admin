# KickON Data Center

KickON 운영자 전용 Next.js 정적 관리자 콘솔입니다. `output: "export"`로 생성한 `out/`을 S3에 올리고 CloudFront에서 제공합니다. 사용자·문의·커뮤니티 운영과 K리그 데이터·동기화·인프라 상태를 한곳에서 관리합니다.

## 로컬 실행

```bash
cp .env.development.example .env.development.local
npm install
npm run dev
```

`npm run dev`는 Next.js와 로컬 관리자 API를 함께 실행합니다. 개발 값은 `.env.development.local`, 운영 빌드용 값은 `.env.production.local`에 각각 둡니다. 두 환경에 공통 적용되는 `.env.local`은 환경 간 secret이 섞일 수 있으므로 사용하지 않습니다. `.env*.local`의 서버 전용 Metrics 키는 로컬 API만 읽으며 브라우저 번들에는 포함하지 않습니다. 웹만 따로 실행하려면 `npm run dev:web`, API만 실행하려면 `npm run dev:admin-api`를 사용합니다.

로컬에서 운영 빌드를 검증해야 할 때만 `cp .env.production.example .env.production.local`로 별도 파일을 만들고 실제 운영 값을 채웁니다. 운영 배포의 secret은 저장소 파일이 아니라 Lambda 등 각 런타임의 환경변수 저장소에서 관리합니다.

개발 환경에서도 실제 쓰기 작업은 Supabase 로그인과 활성 관리자 계정이 있어야 합니다. 인증과 일반 조회·관리 RPC는 브라우저 Supabase 클라이언트와 RLS로 보호합니다. 동기화와 Metrics 연결 수·Storage 큰 파일처럼 비밀값이 필요한 상세 조회는 별도 관리자 API에서 다시 토큰과 역할을 검사합니다.

헤더의 서버 전환 메뉴는 다른 사이트로 이동하거나 문서를 새로고침하지 않습니다. 한 정적 번들에 포함된 개발·운영 Supabase 공개 설정과 관리자 API 주소를 전환하고, 환경마다 분리된 인증 세션을 다시 검사합니다. 이때 헤더·푸터·레이아웃은 유지하고 본문만 로딩 상태로 바뀌므로 전체 화면 점멸과 레이아웃 이동을 줄입니다. 두 환경을 모두 사용하려면 해당 환경의 example 파일에 있는 `NEXT_PUBLIC_KICKON_{DEVELOPMENT,PRODUCTION}_SUPABASE_*`와 환경별 `..._ADMIN_API_BASE_URL`을 설정합니다. 이 두 공개 설정 묶음만 화면 전환을 위해 양쪽 파일에 의도적으로 존재하며, 서버 secret은 절대 공유하지 않습니다.

## 9개 운영 메뉴

- `/` — 대시보드
- `/users` — 사용자
- `/inquiries` — 1:1 문의
- `/moderation` — 신고 및 커뮤니티 관리
- `/squads` — 선수단 관리
- `/standings` — 순위 관리
- `/sync` — 데이터 동기화
- `/usage` — 사용량 및 시스템 상태
- `/audit` — 관리자 감사 로그

기존 17개 콘솔 URL은 새 메뉴로 리다이렉트됩니다. 공개 사용량 대시보드는 제거했으며 `/`도 관리자 인증을 통과해야 합니다.

## 관리자 역할

- `super_admin`: 전체 권한과 관리자 계정 관리
- `support`: 사용자 조회, 문의 조회·답변
- `moderator`: 사용자 경고·정지, 신고 처리, 콘텐츠 숨김·복원
- `data_editor`: 선수·순위 보정과 데이터 동기화

기존 `viewer`, `operator`, `admin` 계정은 마이그레이션 기간 동안 호환합니다. 메뉴를 숨기는 것과 별개로 DB RPC와 별도 관리자 API가 권한을 다시 검사합니다. 관리자 공개 가입 경로는 없습니다.

### 첫 `super_admin` 등록

1. 개발 Supabase의 Authentication에서 운영자 사용자를 직접 만든 뒤 이메일 인증을 완료합니다.
2. 아래 SQL의 이메일만 바꾸어 Supabase SQL Editor처럼 서비스 역할로 실행되는 관리 경계에서 한 번 실행합니다. 브라우저나 공개 API에서 실행하지 마세요.

```sql
insert into public.admin_users (
  user_id,
  role,
  display_name,
  is_active,
  created_by
)
select
  id,
  'super_admin'::public.admin_role,
  coalesce(raw_user_meta_data ->> 'name', email),
  true,
  id
from auth.users
where lower(email) = lower('owner@example.com')
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name,
    is_active = true,
    updated_at = now();
```

실행 후 `admin_users`에 정확히 한 행이 생성됐는지 확인하고, 해당 계정으로 로그인해 `/audit` 접근까지 검증합니다. 이후 다른 관리자는 이 계정으로 역할을 부여합니다.

## Supabase 마이그레이션

관리자 계약은 충돌하던 이전 버전을 정리한 다음 forward migration 순서에 있습니다. 파일명 순서대로 적용합니다.

```text
202609050001_admin_operations.sql
  … 202609050007_provider_player_change_candidates.sql  운영 기반 계약
202609050008_admin_data_center.sql                        역할·capability·관리 기능
202609050009_admin_dashboard_summary.sql
  … 202609050012_exclude_admin_accounts_from_user_metrics.sql  집계·사용자 조회 보정
202609050013_admin_usage_metrics.sql                      DB·Storage 사용량 집계
202609070001_admin_delete_player.sql                      선수 삭제·동기화 복구 차단
202609070002_fixture_attendance_location.sql              일정별 경기장·직관 인증 위치
202609070003_fixture_schedule_edit.sql                     경기 일시·경기장·인증 위치 통합 수정
```

이 순서는 역할·관리자 대시보드 집계·문의 답변·사용자 경고/정지·콘텐츠 숨김/복원·수동 선수·검증명·스토리지 집계·선수 삭제·일정별 직관 인증 위치·감사 로그 계약을 추가합니다. 모바일이 사용하는 기존 테이블과 `team_players.image_url`은 유지합니다.

마지막 `202609050013_admin_usage_metrics.sql`은 `system.read` 권한이 있는 로그인 관리자에게 객체 경로를 노출하지 않는 집계 RPC를 제공합니다. `admin_get_usage_snapshot()`은 DB 크기, 전체 Storage 객체/바이트, 측정 불가 객체와 서울 기준 이번 달 증가량을 반환하고, `admin_get_storage_usage()`는 같은 권한으로 버킷별 합계를 반환합니다. 따라서 DB·Storage 핵심 수치는 서버 secret 없이 선택된 Supabase에서 직접 읽을 수 있으며, 관리자 API의 Metrics/Storage secret 연동은 연결 수와 큰 파일 목록 같은 상세 정보에만 필요합니다.

중요: 모바일 저장소와 이 관리자 저장소가 서로 다른 SQL에 동일한 `202608300001`~`202608300007` 버전을 사용한 이력이 있습니다. 이 저장소의 관리자 전용 SQL은 `202609050001`~`202609050013`으로 재조정했지만, 같은 Supabase 프로젝트에 적용하기 전에 원격 `supabase_migrations.schema_migrations`와 실제 스키마를 감사해야 합니다. 버전 기록만 믿고 기존 파일을 일괄 적용하면 안 됩니다.

`202609070001`~`202609070003`은 원격 개발·운영 DB의 실제 선행 객체를 감사한 뒤 SQL Editor로 적용하고 함수·컬럼·실행 권한을 검증했습니다. 전체 이력 감사와 나머지 운영 적용 순서는 [배포 체크리스트](docs/deployment-checklist.md)를 따릅니다.

## 정적 빌드와 서버 전용 비밀값

정적 번들에는 `.env.development.example` 또는 `.env.production.example`에 정의된 `NEXT_PUBLIC_*` 값만 넣습니다. 환경별 Supabase URL과 publishable key, 관리자 API 경로는 공개 설정이며 보안 경계는 Supabase RLS/RPC와 관리자 API의 토큰·역할 재검사입니다. 다음 값은 S3나 브라우저 번들에 넣지 않고 필요한 백엔드에만 설정합니다.

- `SUPABASE_METRICS_SECRET_KEY`
- `FOOTBALL_SYNC_SECRET`
- `KICKON_PROVIDER_SNAPSHOT_SECRET`
- `KICKON_ERROR_INGEST_SECRET`
- `ERROR_HASH_SALT`

DB와 파일 스토리지는 서로 다른 한도입니다. 서버 설정인 `SUPABASE_DATABASE_LIMIT_GB`, `SUPABASE_STORAGE_LIMIT_GB`는 빌드 때 표시용 공개 값으로 변환되며, 실제 Metrics secret은 관리자 API만 사용합니다.

## 운영 원칙

- 확인할 수 없는 수치는 `0`으로 추정하지 않고 `확인 필요`로 표시합니다.
- 콘텐츠는 운영 화면에서 하드 삭제하지 않고 숨김·복원합니다.
- 모든 중요한 변경은 대상·사유·작업자·변경 전후 값을 감사 로그에 남깁니다.
- 수동으로 잠근 값은 다음 SportsMonks 동기화가 덮어쓰지 못하게 합니다.
- 선수 사진은 조회·표시·업로드·수정하지 않습니다. 이름, 팀, 등번호, 포지션으로 식별합니다.
- 현재 navy/blue 토큰을 유지하고 다크 모드를 기본값으로 사용하며 라이트 모드 선택도 저장합니다.

## 검증

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run build:admin-api
```

빌드 후 `npm start`로 `out/`을 로컬 정적 서버에서 확인할 수 있습니다. `Dev` 개발 브랜치와 `Prod` 운영 브랜치를 사용하며, PR 검증과 `Prod` 자동 배포는 [GitHub Actions 자동 배포](docs/github-actions-deployment.md), 실제 AWS 리소스·CloudFront Function·캐시 설정은 [S3 + CloudFront 배포 문서](docs/s3-cloudfront-deployment.md)를 따릅니다.

`npm test`는 역할별 최소 권한 계약을 검증합니다. 문의·제재·숨김·선수명 전파·수동 선수 보호·순위 잠금·감사 로그 같은 DB 통합 흐름은 마이그레이션을 감사한 뒤 개발 Supabase에서 별도로 실행해야 합니다.

세부 구조는 [아키텍처](docs/architecture.md), 운영 UI 원칙은 [운영자 UX](docs/operator-ux.md), 명세 상태는 [요구사항 상태](docs/requirements-status.md)를 참고하세요.

신규 가입자와 1:1 문의의 Discord 운영 알림 설정은 [Discord 운영 알림](docs/discord-admin-notifications.md)을 참고하세요. Webhook URL은 `.env`가 아니라 Supabase Vault의 `discord_admin_notifications_webhook_url`에 저장합니다.

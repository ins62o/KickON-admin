# KickON Data Center

KickON 운영자 전용 Next.js 관리자 콘솔입니다. 사용자·문의·커뮤니티 운영과 K리그 데이터·동기화·인프라 상태를 한곳에서 관리합니다.

## 로컬 실행

```bash
cp .env.example .env.local
npm install
npm run dev
```

개발 환경에서도 실제 쓰기 작업은 Supabase 로그인과 활성 관리자 계정이 있어야 합니다. `KICKON_ADMIN_AUTH_REQUIRED=false`는 화면 확인용이며, 이 상태에서는 문의 답변·사용자 제재·숨김·동기화 같은 변경 작업을 실행하지 않습니다. `KICKON_ENVIRONMENT=production`에서는 인증 우회가 항상 차단됩니다.

헤더의 서버 전환 메뉴는 같은 화면에서 데이터베이스 키를 교체하지 않고, 환경별로 분리 배포된 관리자 콘솔 사이를 이동합니다. 개발·운영 배포에 `KICKON_DEVELOPMENT_ADMIN_URL`, `KICKON_PRODUCTION_ADMIN_URL`을 각각 설정해야 반대 환경으로 이동할 수 있습니다.

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

기존 `viewer`, `operator`, `admin` 계정은 마이그레이션 기간 동안 호환합니다. 메뉴를 숨기는 것과 별개로 각 Server Action과 DB RPC가 권한을 다시 검사합니다. 관리자 공개 가입 경로는 없습니다.

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

새 관리자 계약은 다음 forward migration에 있습니다.

```text
supabase/migrations/202609020001_admin_data_center.sql
```

이 마이그레이션은 역할·관리자 대시보드 집계·문의 답변·사용자 경고/정지·콘텐츠 숨김/복원·수동 선수·검증명·스토리지 집계·감사 로그 계약을 추가합니다. 모바일이 사용하는 기존 테이블과 `team_players.image_url`은 유지합니다.

중요: 모바일 저장소와 이 관리자 저장소가 서로 다른 SQL에 동일한 `202608300001`~`202608300007` 버전을 사용한 이력이 있습니다. 같은 Supabase 프로젝트에 적용하기 전에 반드시 원격 `supabase_migrations.schema_migrations`와 실제 스키마를 감사하고 마이그레이션 소유권을 통합하세요. 버전 기록만 믿고 기존 파일을 일괄 적용하면 안 됩니다.

현재 작업에서는 원격 개발·운영 DB에 마이그레이션을 적용하지 않았습니다. 운영 적용 순서는 [배포 체크리스트](docs/deployment-checklist.md)를 따릅니다.

## 서버 전용 비밀값

브라우저에 노출 가능한 값은 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`뿐입니다. 다음 값은 서버에서만 읽습니다.

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_METRICS_SECRET_KEY`
- `SUPABASE_MANAGEMENT_ACCESS_TOKEN`
- `SPORTSMONKS_API_TOKEN`
- `FOOTBALL_SYNC_SECRET`
- `KICKON_PROVIDER_SNAPSHOT_SECRET`
- `KICKON_ERROR_INGEST_SECRET`

DB와 파일 스토리지는 서로 다른 한도입니다. `SUPABASE_DATABASE_LIMIT_GB`는 PostgreSQL 테이블·인덱스 사용량, `SUPABASE_STORAGE_LIMIT_GB`는 Storage 버킷의 파일 사용량 계산에 씁니다.

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
```

`npm test`는 역할별 최소 권한 계약을 검증합니다. 문의·제재·숨김·선수명 전파·수동 선수 보호·순위 잠금·감사 로그 같은 DB 통합 흐름은 마이그레이션을 감사한 뒤 개발 Supabase에서 별도로 실행해야 합니다.

세부 구조는 [아키텍처](docs/architecture.md), 운영 UI 원칙은 [운영자 UX](docs/operator-ux.md), 명세 상태는 [요구사항 상태](docs/requirements-status.md)를 참고하세요.

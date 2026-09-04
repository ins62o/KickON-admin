# S3 + CloudFront 배포

이 콘솔은 `next.config.ts`의 `output: "export"`를 사용합니다. `npm run build:static` 결과인 `out/`을 S3에 올리고 CloudFront에서 제공합니다. DB 크기와 Storage 전체·월간·버킷 합계는 `202609050013_admin_usage_metrics.sql`의 인증된 aggregate RPC에서 직접 읽고, DB 연결 수·서버 기준 한도·큰 파일 목록처럼 비밀값이 필요한 상세 정보와 동기화는 `server/admin-api/lambda.ts`의 별도 Lambda가 담당합니다.

자동 배포와 OIDC/IAM 설정은 [GitHub Actions 자동 배포](github-actions-deployment.md)를 기준으로 합니다.

## 오리진과 동작

운영 CloudFront에는 다음 동작이 필요합니다.

| 경로 | 오리진 | 캐시 |
| --- | --- | --- |
| `/api/*` | 운영 관리자 API Lambda Function URL | 비활성화 |
| `Default (*)` | 비공개 S3 버킷(OAC) | 응답의 Cache-Control 준수 |

`/api/*` 동작은 Default보다 우선순위가 높아야 하며 `GET, HEAD, OPTIONS, POST`와 `Authorization`, `Content-Type`, `Origin` 헤더를 오리진으로 전달해야 합니다. API cache policy의 Minimum TTL은 0으로 두고 응답의 `private, no-store`를 존중합니다. 정적 Default 동작도 Minimum TTL을 0으로 두어 HTML의 `no-cache`가 강제로 장기 캐시되지 않게 합니다.

같은 정적 콘솔에서 개발·운영 데이터를 전환하므로 개발 API도 별도 HTTPS 주소로 접근 가능해야 합니다. 개발과 운영 Lambda는 같은 번들을 사용하지만 Supabase URL, publishable key, Metrics secret, 동기화 secret을 서로 공유하지 않습니다.

## 정적 빌드 환경 변수

정적 번들에는 공개 가능한 설정만 넣습니다.

```text
NEXT_PUBLIC_KICKON_ENVIRONMENT
NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT
NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL
NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL
NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL
NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL
NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB
NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB
NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE
NEXT_PUBLIC_ADMIN_SYNC_ENABLED
```

운영 배포의 개발 API 주소에는 `http://127.0.0.1`이나 `localhost`를 넣지 않습니다. 브라우저가 실행되는 운영자의 컴퓨터를 가리키기 때문입니다. 운영 API는 CloudFront의 같은 도메인을 쓸 때 `/api`로 설정합니다.

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_METRICS_SECRET_KEY`, SportsMonks token, 동기화 secret은 정적 번들에 넣지 않습니다.

## 관리자 API 계약

브라우저는 현재 선택한 Supabase의 access token을 `Authorization: Bearer ...`로 보냅니다. API는 매 요청마다 토큰, 활성 `admin_users` 멤버십, 역할 권한을 다시 확인합니다.

- `GET /api/admin/usage/metrics` — Supabase Metrics의 DB 크기 fallback, 연결 수, 서버 기준 한도
- `GET /api/admin/usage/storage` — Storage 버킷별 상세와 큰 파일 목록, 서버 기준 한도
- `POST /api/admin/actions` — 보호된 동기화 작업

핵심 DB/Storage 합계는 선택된 Supabase의 `admin_get_usage_snapshot()` RPC가 제공하므로 상세 API가 일시적으로 실패해도 유지됩니다. RPC와 상세 API가 모두 실패한 항목만 UI가 0으로 추정하지 않고 `확인 필요`로 표시합니다. 따라서 사용량 문제의 전체 수정에는 정적 프런트, `202609050013` migration, 환경별 Lambda가 모두 필요합니다.

GitHub Actions는 migration을 자동 적용하지 않습니다. 과거 migration 버전 충돌 이력이 있으므로 [배포 체크리스트](deployment-checklist.md)에 따라 원격 이력을 감사한 뒤 개발·운영 프로젝트에 수동으로 적용합니다.

## Lambda 빌드와 런타임

```bash
npm run build:admin-api
(cd dist/admin-api && zip -q -9 ../admin-api.zip index.js)
```

두 Lambda 모두 Node.js 22, handler `index.handler`, timeout 60초 이상으로 구성합니다. 브라우저 요청은 Supabase access token으로 애플리케이션 인증을 하므로 Function URL의 AWS 인증은 `NONE`을 사용하고, Function URL 자체의 CORS 대신 Lambda의 `ADMIN_ALLOWED_ORIGINS` 검사를 사용합니다. Function URL은 현재 자동 배포 기준으로 `$LATEST`를 대상으로 합니다. Lambda에는 환경별로 아래 값을 설정합니다.

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
KICKON_ENVIRONMENT
ADMIN_ALLOWED_ORIGINS
FOOTBALL_SYNC_SECRET
SUPABASE_METRICS_SECRET_KEY
SUPABASE_DATABASE_LIMIT_GB
SUPABASE_STORAGE_LIMIT_GB
SPORTSMONKS_API_ALLOWANCE
```

`SUPABASE_METRICS_SECRET_KEY`는 해당 프로젝트의 `sb_secret_` 형식 Secret API key입니다. `ADMIN_ALLOWED_ORIGINS`에는 실제 콘솔 origin을 쉼표로 구분해 넣습니다. 개발 Lambda도 운영 콘솔에서 선택될 수 있으므로 운영 콘솔 origin을 허용해야 합니다.

GitHub Actions는 코드 변경 전에 두 함수의 현재 설정을 읽어 환경명, 해당 Supabase URL/publishable key, Metrics secret 형식, 양수인 DB·Storage 한도와 SportsMonks allowance, 운영 콘솔 origin을 확인합니다. 값 자체는 Actions 로그에 출력하지 않습니다. 이 검사가 실패하면 Lambda나 S3를 변경하기 전에 배포가 중단됩니다.

## CloudFront viewer-request Function

Default 동작의 viewer request에는 `infrastructure/cloudfront/viewer-request.js`를 연결합니다. 이 함수는 확장자 없는 정적 경로를 `index.html`로 바꾸고 이전 상세 URL을 query 기반 정적 상세 페이지로 보냅니다. `/api/*`는 변경하지 않습니다.

GitHub Actions는 기존 Function의 설정을 보존하면서 소스 코드를 update한 뒤 LIVE stage로 publish합니다. Function과 배포의 최초 생성·연결은 AWS에서 한 번 수행해야 합니다.

## 안전한 S3 업로드 순서

새 HTML이 아직 없는 chunk를 참조하거나, 열려 있던 이전 탭의 chunk가 배포 중 사라지지 않도록 해시 자산을 먼저 올리고 이전 해시 자산은 즉시 삭제하지 않습니다.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build:static
npm run build:admin-api

aws s3 sync out/_next/static/ s3://YOUR_BUCKET/_next/static/ \
  --cache-control "public,max-age=31536000,immutable" \
  --only-show-errors

aws s3 sync out/ s3://YOUR_BUCKET \
  --delete \
  --exclude "_next/static/*" \
  --cache-control "no-cache,max-age=0,must-revalidate" \
  --only-show-errors

aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

`--exclude "_next/static/*"`는 두 번째 `--delete`에서 이전 해시 chunk를 보호합니다. 사용하지 않는 이전 `/_next/static/` 객체는 S3 lifecycle로 30일 뒤 만료시키는 것을 권장합니다.

배포 뒤에는 최소한 다음을 확인합니다.

- `index.html`의 Cache-Control이 `no-cache,max-age=0,must-revalidate`인지
- `/_next/static/*` 객체가 `public,max-age=31536000,immutable`인지
- `/login/`이 HTML 200을 반환하는지
- 개발·운영 Metrics API가 토큰 없는 요청에 401을 반환하는지
- 로그인 후 개발·운영 각각의 DB/Storage 값과 한도가 표시되는지

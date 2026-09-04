# GitHub Actions 자동 배포

이 저장소의 배포 경로는 **Next.js static export → S3/CloudFront**와 **관리자 API → AWS Lambda**입니다. [기존 배포 기록](https://insdevlog.tistory.com/51)의 GitHub OIDC 방식을 이어가되, 정적 화면만 교체하고 관리자 API를 빠뜨리는 일이 없도록 두 산출물을 한 워크플로에서 배포합니다.

`.github/workflows/deploy.yml`은 다음처럼 동작합니다.

- Pull Request: lint, typecheck, 테스트, 정적 빌드, Lambda 번들 빌드만 실행합니다.
- `Dev` push: lint, typecheck, 테스트, 정적 빌드, Lambda 번들 빌드만 실행합니다.
- `Prod` push: 같은 검증을 통과한 뒤 운영 배포를 실행합니다.
- 수동 실행: 실행 기준 ref가 `Prod`일 때만 운영 배포합니다.
- `Dev` 또는 `Prod` 대상 Pull Request: 검증만 실행합니다.
- AWS 권한: 배포 job에만 `id-token: write`를 부여하고 장기 액세스 키를 저장하지 않습니다.
- 배포 전: 개발·운영 Lambda의 런타임, 환경별 Supabase 연결, Metrics 키 형식, 사용량 한도, 허용 origin을 값 노출 없이 검사합니다.
- 배포 후: S3 Cache-Control, 로그인 HTML, 개발·운영 관리자 API의 인증 경계를 스모크 체크합니다.

## 1. 사전 AWS 구성

워크플로는 기존 리소스의 코드를 갱신하며 리소스 자체를 생성하지 않습니다. 먼저 아래 리소스가 있어야 합니다.

- 비공개 S3 버킷과 CloudFront OAC
- 운영 정적 사이트용 CloudFront 배포
- Default 동작에 연결된 CloudFront viewer-request Function
- 개발 Supabase 전용 관리자 API Lambda
- 운영 Supabase 전용 관리자 API Lambda
- 운영 `/api/*`를 운영 Lambda Function URL로 보내는 CloudFront 동작
- 브라우저에서 접근 가능한 개발 관리자 API HTTPS URL

두 Lambda는 같은 코드를 사용하지만 런타임 환경 변수와 비밀값은 반드시 분리합니다. 한 Lambda에서 개발·운영 secret을 함께 사용하지 않습니다.

이 workflow는 Supabase migration을 실행하지 않습니다. DB·Storage 핵심 합계를 제공하는 `202609050013_admin_usage_metrics.sql`은 migration 버전 충돌 이력을 먼저 감사한 뒤 [배포 체크리스트](deployment-checklist.md)에 따라 개발·운영에 수동 적용합니다.

## 2. GitHub `production` Environment

Repository **Settings → Environments → New environment**에서 `production`을 만듭니다.

- Deployment branches에는 `Prod`만 허용합니다.
- 완전 자동 배포가 필요하면 Required reviewers는 설정하지 않습니다.
- 아래 값은 모두 Environment **Variables**에 둡니다. `NEXT_PUBLIC_*`는 빌드 뒤 브라우저 번들에 포함되므로 secret이 아닙니다.

```text
AWS_ACCOUNT_ID=<12자리 AWS 계정 ID>
AWS_REGION=ap-northeast-2
AWS_ROLE_TO_ASSUME=arn:aws:iam::<AWS_ACCOUNT_ID>:role/<GITHUB_ACTIONS_ROLE>
AWS_S3_BUCKET=kickon-admin
AWS_CLOUDFRONT_DISTRIBUTION_ID=<DISTRIBUTION_ID>
AWS_CLOUDFRONT_FUNCTION_NAME=<VIEWER_REQUEST_FUNCTION_NAME>
AWS_DEVELOPMENT_ADMIN_API_LAMBDA_FUNCTION_NAME=<DEVELOPMENT_FUNCTION_NAME>
AWS_PRODUCTION_ADMIN_API_LAMBDA_FUNCTION_NAME=<PRODUCTION_FUNCTION_NAME>
ADMIN_SITE_URL=https://admin.kickon.kr

NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL=https://<DEVELOPMENT_PROJECT_REF>.supabase.co
NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY=<DEVELOPMENT_PUBLISHABLE_KEY>
NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL=https://<PRODUCTION_PROJECT_REF>.supabase.co
NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY=<PRODUCTION_PUBLISHABLE_KEY>

NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL=https://<DEVELOPMENT_API_HOST>/api
NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL=/api
NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB=0.5
NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB=1
NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE=2000
NEXT_PUBLIC_ADMIN_SYNC_ENABLED=true
```

`NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL`에 `localhost`, `127.0.0.1` 같은 loopback 주소를 넣으면 운영 사용자의 컴퓨터를 가리키므로 배포가 실패하도록 막아 두었습니다. 개발 API는 실제 HTTPS 주소여야 합니다. 운영 API는 같은 CloudFront의 `/api` 또는 별도 HTTPS 주소를 사용할 수 있습니다.

GitHub Actions Secrets에는 Supabase service role, Metrics secret, SportsMonks token, 동기화 secret을 추가하지 않습니다. 이 값들은 아래 Lambda 런타임에만 둡니다.

## 3. GitHub OIDC 신뢰 정책

GitHub Environment를 사용하는 job의 OIDC `sub`는 브랜치 형식이 아니라 `environment:production` 형식입니다. AWS IAM의 GitHub OIDC 공급자 URL은 `https://token.actions.githubusercontent.com`, audience는 `sts.amazonaws.com`입니다. 현재 구성은 공식 [`configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials) 가이드의 `v6.2.3`을 사용합니다.

2026년 7월 15일 이후 생성되었거나 새 형식에 opt-in한 GitHub 저장소는 owner/repository ID가 포함된 immutable subject를 사용합니다. ID는 다음처럼 확인할 수 있습니다.

```bash
gh api repos/ins62o/KickON-admin --jq '{owner_id: .owner.id, repository_id: .id}'
```

해당 저장소가 immutable subject를 사용한다면 신뢰 정책은 다음처럼 제한합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:ins62o@<OWNER_ID>/KickON-admin@<REPOSITORY_ID>:environment:production"
        }
      }
    }
  ]
}
```

기존 subject 형식을 사용하는 저장소라면 `sub`만 아래 값으로 바꿉니다.

```text
repo:ins62o/KickON-admin:environment:production
```

실제 발급 형식을 확인하지 않은 채 두 형식을 wildcard로 넓히지 않습니다.

## 4. 배포 역할의 최소 권한

아래 리소스 자리표시자를 실제 값으로 바꿉니다. 다른 버킷, 배포, Function, Lambda에는 접근하지 못하게 유지합니다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListDeploymentBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>"
    },
    {
      "Sid": "DeployStaticObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<BUCKET_NAME>/*"
    },
    {
      "Sid": "DeployAdminApiCode",
      "Effect": "Allow",
      "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunctionConfiguration"],
      "Resource": [
        "arn:aws:lambda:<REGION>:<AWS_ACCOUNT_ID>:function:<DEVELOPMENT_FUNCTION_NAME>",
        "arn:aws:lambda:<REGION>:<AWS_ACCOUNT_ID>:function:<PRODUCTION_FUNCTION_NAME>"
      ]
    },
    {
      "Sid": "PublishViewerRequestFunction",
      "Effect": "Allow",
      "Action": [
        "cloudfront:DescribeFunction",
        "cloudfront:UpdateFunction",
        "cloudfront:PublishFunction"
      ],
      "Resource": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:function/<VIEWER_REQUEST_FUNCTION_NAME>"
    },
    {
      "Sid": "RefreshAndVerifyDistribution",
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"],
      "Resource": "arn:aws:cloudfront::<AWS_ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

워크플로의 `allowed-account-ids`도 `AWS_ACCOUNT_ID`와 대조하므로 잘못된 계정의 역할을 맡으면 즉시 실패합니다.

## 5. Lambda 런타임 설정

두 Lambda 모두 Node.js 22, handler `index.handler`, timeout 60초 이상을 사용합니다. 브라우저가 Supabase access token으로 애플리케이션 인증을 수행하므로 Function URL의 AWS 인증은 `NONE`을 사용하고, Function URL 자체의 CORS 대신 이 Lambda의 origin 검사를 사용합니다. Function URL이 alias를 대상으로 한다면 새 버전으로 alias를 옮기는 단계가 별도로 필요합니다. 현재 워크플로는 `$LATEST`를 대상으로 하는 Function URL을 기준으로 합니다.

각 Lambda에는 해당 환경의 값만 설정합니다.

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

- 개발 Lambda: 개발 Supabase URL/key/secret, `KICKON_ENVIRONMENT=development`
- 운영 Lambda: 운영 Supabase URL/key/secret, `KICKON_ENVIRONMENT=production`
- 두 Lambda의 `ADMIN_ALLOWED_ORIGINS`: 최소한 `https://admin.kickon.kr`
- `SUPABASE_METRICS_SECRET_KEY`: 해당 프로젝트의 `sb_secret_` 형식 Secret API key

`SUPABASE_DATABASE_LIMIT_GB`와 `SUPABASE_STORAGE_LIMIT_GB`는 서로 다른 한도입니다. 이 두 값이 빠지면 실제 사용 byte를 읽어도 사용률의 분모를 계산할 수 없습니다.

Actions는 코드 배포 전에 `GetFunctionConfiguration`으로 두 함수의 설정을 읽고 다음 조건을 검사합니다. 환경 변수 응답은 runner 메모리에서만 다루며 실제 값이나 secret은 로그·summary에 출력하지 않습니다.

- Runtime `nodejs22.x`, handler `index.handler`, timeout 60초 이상
- `KICKON_ENVIRONMENT`가 함수 용도와 일치
- `NEXT_PUBLIC_SUPABASE_URL`과 publishable key가 해당 환경의 공개 빌드 설정과 일치
- `SUPABASE_METRICS_SECRET_KEY`가 비어 있지 않고 `sb_secret_` 형식
- DB·Storage 한도와 SportsMonks allowance가 양수
- `ADMIN_ALLOWED_ORIGINS`가 `ADMIN_SITE_URL`의 origin을 정확히 포함

Lambda 환경 변수를 고객 관리형 KMS key로 암호화했고 배포 역할이 설정을 읽지 못한다면 해당 key 하나에만 `kms:Decrypt`를 추가합니다. 기본 Lambda 암호화에서는 별도 KMS 권한을 넓히지 않습니다.

## 6. 배포 순서와 캐시

운영 job은 다음 순서를 보장합니다.

1. 실제 운영 Variables가 모두 있는지 검사하고 loopback API URL을 거부합니다.
2. 정적 사이트와 Lambda를 깨끗한 runner에서 다시 빌드합니다.
3. 개발·운영 Lambda의 기존 런타임 설정이 안전하고 완전한지 값 노출 없이 검사합니다.
4. 동일한 Lambda zip을 개발·운영 함수에 배포하고 업데이트 완료를 기다립니다.
5. 새 `/_next/static/*` 해시 자산을 먼저 업로드합니다.
6. HTML과 public 자산을 올린 뒤 삭제된 페이지를 S3에서 정리합니다.
7. viewer-request Function을 갱신·publish합니다.
8. CloudFront invalidation 완료를 기다리고 캐시 메타데이터와 HTTP 응답을 검증합니다.

빌드 직후에는 로컬 관리자 API fallback(`127.0.0.1:3001`)이 정적 산출물에 남지 않았는지도 확인합니다. `/_next/static/*`는 `public,max-age=31536000,immutable`, HTML과 고정 이름 public 자산은 `no-cache,max-age=0,must-revalidate`로 업로드합니다. 이전 해시 자산은 배포 중 열려 있던 탭이 계속 읽을 수 있도록 즉시 삭제하지 않습니다. S3 lifecycle로 `/_next/static/`의 사용하지 않는 이전 객체를 30일 이후 만료시키는 방식을 권장합니다.

스모크 체크는 로그인 HTML에서 서비스 제목을 확인하고, 개발·운영 `/admin/usage/metrics`가 토큰 없는 요청에 `401`을 반환하는지 확인합니다. 교차 출처 HTTPS API에는 운영 콘솔 origin의 CORS 응답 헤더도 요구합니다. 이 검사는 배포된 Lambda와 인증/CORS 경계를 확인하며, 로그인된 실제 DB/Storage 값 확인은 배포 뒤 관리자 계정으로 수행합니다.

## 7. Vercel과 중복 배포 방지

현재 저장소에는 Vercel 프로젝트 설정이나 Vercel 배포 workflow가 없고, Next.js도 `output: "export"`로 S3 배포를 전제로 합니다. 이 Actions 경로에서는 `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`가 필요하지 않습니다.

과거에 이 GitHub 저장소를 Vercel Git Integration에 연결했다면 `Prod` push마다 Vercel과 AWS가 동시에 배포될 수 있습니다. 운영 도메인이 S3/CloudFront를 사용한다면 Vercel의 자동 Production Deployment를 끄거나 프로젝트 연결을 해제해 배포 기준을 하나로 유지합니다.

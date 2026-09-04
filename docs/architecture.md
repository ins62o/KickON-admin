# KickON Data Center 아키텍처

## 경계

관리자 콘솔은 Next.js App Router를 정적 export하여 S3 + CloudFront에서 제공합니다. 하나의 문서가 사용자가 선택한 환경을 보관하고 개발·운영별 Supabase 클라이언트와 관리자 API를 사용합니다. 브라우저는 선택된 환경의 Supabase access token으로 RLS가 적용된 조회와 관리자 RPC를 호출합니다. 동기화, Supabase Metrics 연결 수, Storage 큰 파일처럼 비밀값이 필요한 상세 요청만 환경별 관리자 API로 보냅니다. 서비스 역할 키와 SportsMonks 토큰은 정적 번들에 포함하지 않습니다.

```text
브라우저 ── CloudFront ── 비공개 S3(out/)
  └─ 선택 환경(development | production)
      ├─ 환경별 Supabase JS + access token ── RLS / 관리자 RPC
      │                                      ├─ 조회·관리 작업
      │                                      └─ DB·Storage aggregate 사용량
      └─ 환경별 /api + access token ── 관리자 API
                                      ├─ 토큰·활성 관리자·역할 재검사
                                      ├─ 동기화
                                      └─ 비밀값 기반 상세 지표
```

## 경로 구조

```text
/
├─ users/detail?userId=...
├─ inquiries/detail?inquiryId=...
├─ moderation/detail?reportId=...
├─ squads/detail?playerId=...
├─ standings/detail?teamId=...
├─ sync
├─ usage
└─ audit/detail?auditId=...
```

`(console)/layout.tsx`의 클라이언트 인증 Provider가 모든 경로에서 활성 관리자 세션을 확인합니다. `AppShell`은 인증 확인과 환경 전환 중에도 헤더·푸터·본문 영역을 같은 구조로 렌더링하고, 환경 전환은 전체 탐색 없이 환경별 세션과 본문 데이터만 다시 확인합니다. 각 페이지는 필요한 읽기 권한을 확인합니다. 쓰기는 DB RPC 또는 관리자 API가 권한을 독립적으로 재검사하며, 상단 메뉴 필터는 편의 기능일 뿐 보안 경계가 아닙니다. 기존 동적 URL은 CloudFront Function이 정적 상세 경로와 query string으로 변환합니다.

## 역할과 권한

| 역할 | 핵심 범위 |
| --- | --- |
| `support` | 사용자 조회, 문의 조회·답변 |
| `moderator` | 사용자 경고·정지, 신고 처리, 숨김·복원 |
| `data_editor` | 선수·순위 데이터 조회·보정, 동기화 |
| `super_admin` | 전체 기능과 관리자 계정 관리 |

기존 `viewer`, `operator`, `admin`은 전환 기간 호환 역할입니다. DB의 `admin_has_capability()`도 UI와 동일한 업무 권한을 검사합니다.

## 데이터 계약

- 대시보드: `profiles`, `posts`, `comments`, `attendances`, `support_inquiries`, `content_reports`, `sync_runs`, `football_sync_state`
- 사용자: 기본 프로필과 활동 집계. 신규 migration 뒤에는 `admin_get_users` RPC가 제재 상태와 경고 횟수를 결합합니다.
- 문의: 기존 `support_inquiries`를 유지하고 답변 필드와 별도 관리자 메모 테이블을 추가합니다.
- 신고: 기존 `content_reports`와 대상 `POST`, `COMMENT`, `FIXTURE_CHEER` 원문을 결합합니다.
- 콘텐츠 조치: 하드 삭제하지 않고 `moderation_status=HIDDEN|VISIBLE`을 사용합니다.
- 선수: `team_players`와 `football_player_localizations`를 사용하며 사진 필드는 관리자 조회에서 제외합니다.
- 사용량: `admin_get_usage_snapshot()`이 선택된 DB의 크기와 Storage 전체·서울 기준 이번 달 합계를 객체 경로 없이 반환하고, `admin_get_storage_usage()`가 버킷별 합계를 반환합니다. 환경별 관리자 API는 Metrics 연결 수와 Storage 큰 파일 같은 선택적 상세 정보를 보강합니다. 상세 API가 실패해도 직접 RPC로 확인한 핵심 합계는 유지합니다. SportsMonks는 수집된 호출 로그와 응답 제한 정보를 사용합니다.
- 감사: 관리자 변경은 대상·사유·작업자·변경 전후 값을 `admin_audit_logs`에 남깁니다.

조회 실패는 0으로 바꾸지 않습니다. 새 컬럼/RPC가 아직 없을 때 읽기 모듈은 확인 가능한 레거시 필드만 반환하고 `schemaReady`/`enhancementsReady`로 쓰기 UI를 비활성화합니다.

## 모바일 호환

`202609050008_admin_data_center.sql`은 기존 모바일 테이블에 추가형 변경만 수행합니다. 선수 `image_url`은 남겨 두되 관리 콘솔에서 사용하지 않습니다. 숨김 콘텐츠는 일반 모바일 조회 정책에서 제외되고, 정지 사용자는 커뮤니티 쓰기 정책에서 차단됩니다. 적용 전후로 모바일 핵심 쿼리와 RLS 회귀 테스트가 필수입니다.

## 마이그레이션 주의

모바일 저장소와 관리자 저장소가 과거 서로 다른 내용에 `202608300001`~`202608300007`을 사용했습니다. 이 저장소에서는 관리자 전용 migration을 전역 고유 순서 `202609050001`~`202609050013`으로 조정했습니다. `001`~`007`은 운영 기반, `008`은 역할·capability와 핵심 데이터 센터 계약, `009`~`012`는 대시보드·사용자 조회 보정, `013`은 DB·Storage aggregate 사용량 RPC입니다. 파일명 순서대로 적용하되, 먼저 원격 `schema_migrations`와 실제 객체를 감사해 과거 충돌 이력을 통합해야 합니다.

배포 경로와 OIDC/IAM 설정은 [GitHub Actions 자동 배포](github-actions-deployment.md)를 기준으로 합니다.

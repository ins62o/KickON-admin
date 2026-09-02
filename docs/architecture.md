# KickON Data Center 아키텍처

## 경계

관리자 콘솔은 Next.js App Router의 Server Component를 기본으로 사용합니다. 읽기는 서버에서 Supabase를 호출하고, 쓰기는 인증·역할·입력·Origin을 다시 확인하는 Server Action이 관리자 전용 RPC를 호출합니다. 브라우저에는 서비스 역할 키나 SportsMonks 토큰을 전달하지 않습니다.

```text
브라우저
  ├─ Server Component ── 관리자 읽기/RPC ── Supabase
  └─ Server Action ── 인증·권한·검증 ── 감사 가능한 RPC
                                      ├─ 문의 답변
                                      ├─ 사용자 경고·정지
                                      ├─ 콘텐츠 숨김·복원
                                      └─ 데이터 보정·동기화
```

## 경로 구조

```text
/
├─ users/[userId]
├─ inquiries/[inquiryId]
├─ moderation/[reportId]
├─ squads/[playerId]
├─ standings/[teamId]
├─ sync
├─ usage
└─ audit/[auditId]
```

`(console)/layout.tsx`는 모든 경로에서 활성 관리자 세션을 확인합니다. 각 페이지는 다시 필요한 읽기 권한을 확인하며 각 Server Action은 쓰기 권한을 독립적으로 확인합니다. 상단 메뉴 필터는 편의 기능일 뿐 보안 경계가 아닙니다.

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
- 사용량: PostgreSQL Metrics와 Storage 버킷 실제 파일 합계를 별도로 집계합니다. SportsMonks는 수집된 호출 로그와 응답 제한 정보를 사용합니다.
- 감사: 관리자 변경은 대상·사유·작업자·변경 전후 값을 `admin_audit_logs`에 남깁니다.

조회 실패는 0으로 바꾸지 않습니다. 새 컬럼/RPC가 아직 없을 때 읽기 모듈은 확인 가능한 레거시 필드만 반환하고 `schemaReady`/`enhancementsReady`로 쓰기 UI를 비활성화합니다.

## 모바일 호환

`202609020001_admin_data_center.sql`은 기존 모바일 테이블에 추가형 변경만 수행합니다. 선수 `image_url`은 남겨 두되 관리 콘솔에서 사용하지 않습니다. 숨김 콘텐츠는 일반 모바일 조회 정책에서 제외되고, 정지 사용자는 커뮤니티 쓰기 정책에서 차단됩니다. 적용 전후로 모바일 핵심 쿼리와 RLS 회귀 테스트가 필수입니다.

## 마이그레이션 주의

모바일 저장소와 관리자 저장소에 서로 다른 내용의 `202608300001`~`202608300007` 파일이 존재합니다. 같은 원격 프로젝트에서는 migration version 충돌이 발생할 수 있습니다. 새 migration 적용 전에 원격 `schema_migrations`와 실제 객체를 감사하고 기존 이력을 통합해야 합니다. 이후 파일은 전역 고유 버전 `202609020001`을 사용합니다.

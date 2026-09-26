# 앱 업데이트 운영 반영

사용자가 운영 배포를 승인하여 개발에서 검증한 최종 UI와 복원 기능을 운영에 반영했다.

## 운영 DB

프로젝트 `smihjaucucffmsbktnmp`에서 기존 설정 0건 및 복원 RPC 미적용을 먼저 확인했다. `202609170001_cancel_app_store_release.sql`을 트랜잭션으로 적용하고 같은 트랜잭션에 `supabase_migrations.schema_migrations` 이력(버전, 이름, 원본 SQL)을 등록했다. PostgREST 스키마 갱신을 통지했다. 기본 테이블 및 기존 저장 RPC는 재생성하지 않았다.

읽기 검증에서 함수 본문이 검증한 migration 소스와 일치하고 SECURITY DEFINER/빈 search_path 설정을 유지하는 것을 확인했다. anon 실행은 금지, authenticated 실행은 허용하며 함수 내부의 활성 관리자 검사 계약을 유지한다. migration 이력 `202609170001`을 확인했다.

실제 운영 어드민의 인증 세션으로 기존 저장 RPC를 호출하여 다음 설정을 등록했다.

| 플랫폼 | 버전 | 안내 | 감사 ID |
| --- | --- | --- | --- |
| Android / Google Play | 1.0.0 | true | 47 |
| iOS / App Store | 1.0.2 | true | 48 |

각 저장 사유와 작업자는 관리자 감사 기록에 저장됐다. 운영 DB 재조회로 두 설정과 관련 감사 기록 2건을 확인했다.

## 어드민 배포

개발 작업공간을 유지하고 별도 임시 worktree에서 운영 배포 merge 커밋 `6c5d030488089c27de57d046f0666513311ecd02`를 만들었다. 최신 Dev 검증 커밋을 Prod에 반영하여 Actions `35116656854`를 실행했다.

Actions 검증 및 운영 배포가 모두 성공했다. 정적 콘솔, 개발/운영 Lambda, CloudFront viewer-request 함수와 캐시 무효화가 반영됐으며 로그인 페이지와 두 API의 인증 경계 smoke check가 통과했다. 정적 개발 콘솔의 `development/` 경로는 보존됐다.

배포된 `https://admin.kickon.kr/data-management/?appUpdates=1`에서 운영 서버 표시, Google Play 1.0.0 / App Store 1.0.2, 설명/사유/체크박스가 제거된 폼 및 복원 버튼을 확인했다. 저장값과 동일할 때 저장 버튼 비활성화, 입력을 1.0.3으로 수정할 때 저장 활성화를 확인했다. 1.0.3은 저장하지 않았다. 그 후 브라우저가 종료되어 해당 화면의 취소 클릭 확인은 수행하지 못했으며, 이 동작은 동일 소스의 개발 배포에서 검증했다.

실제 출시 앱 바이너리에 업데이트 라벨/버전 조회 기능이 포함됐는지 및 실기기에서 스토어로 이동하는지는 이번 어드민 배포 검증 범위에 포함되지 않는다. 해당 모바일 검증은 별도로 남아 있다.

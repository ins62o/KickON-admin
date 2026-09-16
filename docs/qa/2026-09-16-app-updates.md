# 앱 업데이트 라벨 관리 검증 — 2026-09-16

## 구현과 연결

기존 KickON 앱(`/Users/inseong/KickON`)과 어드민의 작업 중인 앱 업데이트 구현을 확인하고 어드민을 보완했다. 기존 변경 내용은 유지했다.

- 시스템 → 앱 업데이트에서 Android/iOS의 출시 버전과 표시 여부를 각각 저장한다.
- 저장은 현재 선택한 환경의 관리자 세션으로 `admin_set_app_store_release`를 호출한다. RPC는 활성 `admin`/`super_admin`만 허용하고 변경 사유 3~1,000자, 플랫폼과 숫자 버전을 검증한다.
- 테이블 직접 쓰기는 `anon`/`authenticated` 모두 금지한다. 앱은 공개 SELECT로 활성 안내만 읽는다. 관리자는 꺼진 설정도 조회할 수 있다.
- RPC는 플랫폼별 트랜잭션 잠금으로 설정 변경과 `admin_audit_logs`의 작업자·역할·사유·변경 전후 값 기록을 함께 처리한다.
- 설정 화면에 현재 환경, 마지막 변경 시각, 최근 50건의 플랫폼별 변경 전후 값과 사유를 표시한다. 이력 상세에서 작업자를 확인한다. 공통 관리자 변경 기록에도 앱 업데이트 대상·필드 이름과 원본 화면 링크를 추가했다.
- 환경 전환 시 데이터 의존성과 폼 키에 환경을 포함하여 다른 서버의 입력·설정이 섞이지 않도록 했다.

앱의 기존 `useAppUpdate`, `HomeScreen`, `QueryProvider`, 네이티브 버전 모듈, 스토어 링크와 캐시 정책을 확인했다. 이 작업에서 모바일 소스는 수정하지 않았다.

- 출시 버전이 설치 버전보다 **엄격히 높은 경우**에만 표시한다. 버전은 숫자 구성요소로 비교하며 `1.0.10 > 1.0.9`, `1.0 = 1.0.0`으로 판단한다.
- 플랫폼이 다르거나 안내가 꺼졌거나 설치 버전/설정이 없거나 조회가 실패하면 숨긴다.
- Android는 `market://details?id=kr.kickon.app`, iOS는 `itms-apps://apps.apple.com/app/id6809176002`로 이동하며 실패하면 각 스토어 웹 주소를 연다.
- 홈 focus에서 refetch한다. 앱 active 복귀 시 `QueryProvider`가 해당 활성 쿼리를 다시 조회하므로 1분 staleTime 이내의 복귀도 최신 설정을 확인한다. 실행 중 5분 주기로 조회하며 영구 캐시에 저장하지 않는다.

## 미리보기와 서버 설정의 구분

처음 확인한 모바일 소스에는 `__DEV__`에서 저장값/딥링크로 강제 표시하는 디자인 미리보기가 있었다. 검증 중 모바일 저장소의 현재 소스가 미리보기 제거 상태로 갱신됐으며 그 최종 소스를 대상으로 검증했다. 미리보기 스크린샷을 실제 서버 설정 동작의 증거로 사용하지 않았다.

현재 소스에서 과거 `kickon-dev-app-update-preview=update/matchday` 값 또는 `kickon-dev://update-preview` URL이 남아 있어도 개발·출시 모드 모두 라벨을 강제로 표시하지 않는 테스트가 통과했다. 로컬 어드민은 모의 데이터가 아니라 선택한 실제 개발/운영 Supabase를 조회했다.

## 실제 서버 상태

| 대상 | 확인 결과 | 남은 작업 |
| --- | --- | --- |
| 개발 DB `uvsmyftwwucrvoteajpi` | 테이블·RPC·두 SELECT 정책 존재, RPC 정의가 로컬 SQL과 같은 계약. `202609160003`/`202609160004` 이력 등록 없음 | 실제 객체와 일치하는 두 이력을 등록/repair. 테이블 생성 SQL 재실행 금지 |
| 개발 DB 설정 | 설정 0행, 관련 감사 로그 0행. QA 트랜잭션 롤백 후 다시 확인 | 필요 시 개발용 출시 버전/표시 여부를 관리자 화면에서 등록 |
| 운영 DB `smihjaucucffmsbktnmp` | 테이블·RPC·두 migration 이력 모두 없음. `admin_users`, `admin_audit_logs`, `admin_role`, `admin_has_capability(text)` 선행 객체 존재 | `202609160003` → `202609160004` 적용과 이력 정합성 확인 |
| 운영 어드민 `https://admin.kickon.kr` | `/app-updates/` HTTP 403/XML. 새 정적 화면 미배포 | 검증된 변경을 Prod 배포하여 S3/CloudFront 정적 산출물 갱신 |
| 최신 성공 배포 | Actions run `34860730497`, 2026-09-14 UTC, 커밋 `ccecd3e5aeb474a0299025cc017eec3f9b4bf4dd` | 신규 화면은 이 배포 커밋에 포함되지 않음 |
| 병행 실행의 개발 CI | Dev 커밋 `9982864bd75397d76a1e8af1c3cae597444dd68c`, run `35109155401` 진행 중으로 최종 재조회됨 | 운영 정적 배포가 아님. 이후 보완한 환경 데이터 의존성·화면 여백·중복 재조회 제거와 브라우저 RPC 테스트는 작업 트리에 있으므로 배포 후보에 함께 포함 |

Supabase SQL Editor의 catalog 조회로 객체·정책·RPC 정의·이력을 확인했으며 운영 DB는 읽기만 수행했다. 공개 REST 조회는 개발 HTTP 200/빈 배열, 운영 HTTP 404/PGRST205였다. REST OpenAPI는 401이라 RPC 존재 판단에 사용하지 않았다.

## 검증 결과

- 어드민 `npm test`: 111개 통과. 실제 Supabase 브라우저 번들을 사용한 개발↔운영 세션 분리, 플랫폼별 RPC 파라미터, 이력 조회 범위, 잘못된 입력의 네트워크 요청 차단 포함.
- `npm run lint`, `npm run typecheck`, `npm run build:static`, `npm run build:admin-api` 통과. `/app-updates` 정적 경로 생성 확인.
- `node scripts/verify-app-update.mjs /Users/inseong/KickON`: 앱 관련 3개 suite/15개 테스트 통과. Android/iOS 하위·동일·상위 버전, 꺼짐, 조회 실패, 네이티브/웹 스토어 링크, 미리보기 잔존값 무시, staleTime 이내 앱 복귀 재조회, 캐시 정책 포함. 서버 응답은 이 테스트에서 모의 처리한다.
- **실제 개발 DB**의 트랜잭션 QA 통과: RPC 실행 권한, 직접 쓰기 차단, 미인증/비관리자 차단, 잘못된 플랫폼/버전/빈 사유 차단, Android/iOS 독립 설정, iOS 끄기, 감사 로그 3건의 작업자/변경 전후 값, anon의 활성 Android만 조회 확인. 모두 롤백하고 설정·QA 이력 0건을 다시 확인했다. PostgreSQL identity 시퀀스는 롤백되지 않으므로 로그 번호에 공백이 생길 수 있다.
- 재현용 개발 SQL: `supabase/manual/verify_app_store_releases.sql`. 실제 관리자 계정 하나를 트랜잭션 내부 인증 claim으로 사용하며 신규 관리자/권한/계정은 만들지 않는다.
- 로컬 브라우저: 실제 관리자 세션에서 개발 DB의 Android/iOS 폼과 빈 이력 확인. 운영 전환 시 미적용 DB 오류와 재시도 버튼 확인. 브라우저의 실제 저장 버튼으로 영구 설정을 변경하지는 않았다.

## 운영 반영 순서

1. 운영 DB의 현행 스키마와 복구 수단을 보관하고 대상 두 SQL만 검토한다. 전체 `db push`로 다른 미적용 migration을 함께 밀지 않는다.
2. 운영 DB에 `202609160003_app_store_releases.sql`, `202609160004_admin_app_store_releases.sql`을 순서대로 적용한다. 테이블·RLS·RPC·권한·감사 의존성을 확인하고 migration 이력을 실제 적용 상태와 맞춘다. 개발은 이미 객체가 있으므로 이력 정리만 필요하다.
3. 어드민 소스를 배포 가능한 커밋으로 확정하고 Prod의 기존 GitHub Actions → S3/CloudFront 배포를 실행한다. workflow는 DB migration을 자동 적용하지 않는다. 이 기능 자체에는 Lambda API 변경이나 별도 Edge Function이 필요 없다.
4. 앱은 Android `AppInfoPackage`와 iOS `DeviceLocale.appVersion`이 포함된 새 네이티브 출시 빌드로 배포해야 한다. 과거 스토어 설치본에 JS/네이티브 기능을 소급 적용할 수 없다. 모바일 저장소에는 이 기능 외에도 진행 중인 변경이 많으므로 앱 배포 대상은 별도 검토한다.
5. 플랫폼별 스토어에서 실제 제공되는 버전을 확인한 뒤 **운영 서버** 어드민에서 그 버전과 변경 사유를 저장하고 안내를 켠다. 이 문서의 `1.0.3`/`1.0.4`는 테스트 예시이며 운영 출시 버전 확정값이 아니다.
6. 해당 기능이 포함된 실제 출시 앱에서 하위·동일·상위 설치 버전과 안내 끄기, 홈 재진입·앱 복귀, 스토어 이동을 확인한다. 실기기/출시 바이너리까지의 운영 E2E 검증은 배포 후 필요하다.

이번 작업은 운영 DB 적용이나 운영 배포를 실행하지 않았다. 기존 배포 상태와 필요한 반영 항목을 확인하고 구현·빌드·개발 검증을 완료했다.

## 후속 요청: 데이터 관리 통합 및 개발 배포 완료

- 독립 앱 업데이트 메뉴를 제거하고 데이터 관리의 사용량 카드 행에 네 번째 앱 업데이트 카드를 추가했다. 버튼에서 Android·iPhone 설정 및 이력을 팝업으로 연다. 기존 `/app-updates/`는 데이터 관리 팝업으로 이동한다.
- 개발 콘솔: `https://admin.kickon.kr/development/data-management/`.
- 개발 전용 빌드에 `/development` basePath를 적용하고 개발 DB만 연결한다. 운영 모드 저장값·전환을 무시하며 운영 인증을 시도하지 않는다. 로그인 후 basePath가 중복되지 않는 테스트를 추가했다.
- Dev 자동 배포는 기존 개발 Lambda와 S3의 `development/` prefix만 갱신한다. 정적 자산을 먼저 올리고 `/development/*`만 무효화한다. 향후 Prod 배포의 삭제 동기화에서도 `development/*`를 제외한다.
- 배포 코드 커밋: `72fe4fd7a71d1e5276083ffed2528e86b79c1cc8`.
- GitHub Actions run `35110157485` 성공: 검증 57초, 개발 배포 1분 37초. 운영 배포 job은 skipped.
- 어드민 테스트 112개·lint·typecheck·개발 정적 빌드 통과.
- 공개 개발 로그인과 데이터 관리 페이지 HTTP 200, 각 페이지의 JS 16개/28개 모두 HTTP 200, `/development/_next/` 경로 확인.
- 실제 배포된 관리자 세션에서 개발 DB 사용량, 앱 업데이트 버튼, Android·iPhone 폼, 빈 이력 로드 확인. 설정 값을 영구 변경하지 않았다.
- 운영 로그인 HTML의 SHA-256이 개발 배포 전후 동일함을 확인했다. 운영 DB·Lambda·운영 정적 파일에는 이번 변경을 반영하지 않았다.

앞의 운영 미적용 사항은 그대로이며, 개발 어드민 미배포 항목은 이 후속 배포로 해소됐다.

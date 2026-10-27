# 인천 유나이티드 공식 로고 보존 근거

기존 Prod의 사용 근거를 유지하는 문서다. 새로운 사용 승인이나 권리 범위 확대를 뜻하지 않는다.

- 기존 Prod 문서는 2026-10-23 사용자가 로고 사용 승인을 전달했고, 구단 답변에 따른 비상업적 목적의 공식 홈페이지 엠블럼 사용이라고 기록한다. 답변 원본을 이번 통합에서 새로 조회하지 않았다
- 서비스 이미지 `public/teams/incheon.webp`는 Prod와 Dev의 바이트가 동일하며, SHA-256은 `bdb9890a9b208cc944bed0c3ce47db6361493604c62d415b910452a1c309c1d9`다. `TeamMark`의 `/teams/<id>.webp` 경로와 이미지 도형·색상·비율은 변경하지 않는다
- 공식 출처는 https://www.incheonutd.com/assets/images/common/emblem/svg/logo_incheon_united_color.svg 이다. 이번 작업에서는 외부 이미지를 요청하지 않았다
- 당시 SVG SHA-256은 `2d0566b65f66a1f3dfc1447118163d55254c722633d9725ef1d72448025e0831`이다. 원본 SVG는 실행 소스에 재추가하지 않고 기존 보존 경계를 유지한다
- [당시 Prod 문서](https://github.com/ins62o/KickON-admin/blob/aef19d5d9d72f6b3578d69f45dfae98c226e2044/docs/design/club-logos/incheon.md)의 Git blob은 `c2eb74ceac7dc668024f50078b7701869791cfda`다. [당시 SVG 원본](https://github.com/ins62o/KickON-admin/blob/aef19d5d9d72f6b3578d69f45dfae98c226e2044/docs/design/club-logos/incheon.svg)도 같은 커밋과 기존 branch bundle로 복구할 수 있다

기존 App 저장소의 승인 답변 위치는 당시 문서의 출처 설명으로만 유지한다. App 또는 Admin에 Migration 권위를 부여하지 않으며 다른 저장소를 수정하지 않는다.

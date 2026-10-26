# 모바일 데이터 제보 연결

## 전제

- Supabase 마이그레이션 `202608300001`~`202608300006`이 순서대로 적용되어야 한다.
- 데이터 센터 서버에 `SUPABASE_SERVICE_ROLE_KEY`가 설정되어야 한다.
- 모바일 사용자는 Supabase Auth에 로그인한 상태여야 한다.

## HTTP 계약

`POST /api/data-reports`

```http
Authorization: Bearer <supabase-access-token>
Content-Type: application/json
X-Request-Id: report-<device-generated-uuid>
```

```json
{
  "entityType": "player",
  "entityId": "12345",
  "fieldPath": "jersey_number",
  "currentValue": 10,
  "proposedValue": 9,
  "description": "현재 등록된 등번호가 실제 선수단과 다릅니다.",
  "evidenceUrls": ["https://example.com/evidence/player-12345"],
  "clientRequestId": "report-550e8400-e29b-41d4-a716-446655440000"
}
```

`entityType`은 `team`, `player`, `fixture`, `standing`, `ranking`, `other` 중 하나다. `other`를 제외한 유형은 현재 DB에 존재하는 대상 ID가 필요하다. 선수 누락처럼 아직 존재하지 않는 대상을 신고할 때는 소속 구단을 `team`으로 지정하거나 `other`를 사용한다.

`clientRequestId`는 재시도 시 같은 값을 재사용한다. 첫 접수는 HTTP `201`/‘created: true’, 동일한 요청의 재전송은 HTTP `200`/‘created: false’와 같은 `reportId`를 반환한다.

```json
{
  "accepted": true,
  "reportId": "550e8400-e29b-41d4-a716-446655440000",
  "created": true
}
```

## 제한과 오류

- 본문은 UTF-8 기준 64KB 이하다.
- 설명은 3~4,000자, 필드 경로는 최대 200자다.
- 현재·제안 값은 각각 정제 후 20KB 이하다.
- 증빙 URL은 Query String과 Fragment를 제거한 HTTPS URL만 최대 5개 받는다.
- 사용자별 최대 시간당 10건을 접수한다. 초과 시 HTTP `429`/`RATE_LIMITED`를 반환한다.
- 인증 실패는 `401`, 대상 미존재는 `404`, 입력 계약 위반은 `400`을 반환한다.

접수 시 상태는 항상 `open`, 우선순위는 항상 `normal`로 생성된다. 담당자·처리 메모·완료 시각은 모바일 요청에서 받지 않으며, 제보 접수 후 데이터 센터의 인증된 운영자만 변경한다.

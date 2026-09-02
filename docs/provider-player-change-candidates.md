# SportsMonks 선수 이동 후보 연결

`POST /api/player-change-candidates`는 SportsMonks 응답에는 보이지만 아직 `team_players`에 반영되지 않은 이동을 운영 큐에 먼저 등록한다. 이 Route는 선수단 데이터를 직접 수정하지 않는다.

## 인증과 호출 위치

- 신뢰된 Edge Function 또는 서버만 호출한다.
- `x-kickon-provider-snapshot-secret` 또는 `x-football-sync-secret` 헤더를 사용한다.
- Secret은 모바일 번들에 포함하지 않는다.
- SportsMonks 응답을 정상적으로 파싱한 뒤, `team_players`를 비활성화하거나 Upsert하기 전에 후보를 전송한다.
- 후보 접수 실패 여부는 Provider 동기화 로그에 남기되, 실제 선수단 저장의 성공 여부와 분리한다.

## 요청 예시

```json
{
  "provider": "sportmonks",
  "sourceEndpoint": "https://api.sportmonks.com/v3/football/squads/teams/123?api_token=redacted",
  "syncRunId": "7f93dfbe-8a1f-4df7-8a56-4d831dad7d95",
  "candidates": [
    {
      "sourceEventId": "transfer-98765",
      "playerId": "123456",
      "playerName": "선수 이름",
      "fromTeamId": "team-a",
      "toTeamId": "team-b",
      "changeType": "transfer",
      "movementDate": "2026-08-30",
      "observedAt": "2026-08-30T05:30:00.000Z",
      "beforeValue": { "teamId": "team-a", "teamName": "이전 구단" },
      "afterValue": { "teamId": "team-b", "teamName": "현재 구단" }
    }
  ]
}
```

Query String과 Fragment는 `sourceEndpoint` 저장 전에 제거한다. 로컬 팀 ID를 확정할 수 없으면 ID 대신 `fromTeamName` 또는 `toTeamName`을 보낼 수 있지만, 이 경우 자동 DB 반영 판정은 하지 않고 운영자 확인 대상으로 남긴다.

허용 유형은 `squad_added`, `transfer`, `loan_in`, `loan_out`, `loan_return`, `released`, `contract_expired`, `squad_removed`, `unknown`이다. 한 요청은 1~100건, 전체 UTF-8 본문은 256KB 이하이다.

## 응답과 멱등성

정상 접수는 HTTP `202`와 다음 집계를 반환한다.

```json
{
  "accepted": true,
  "acceptedCount": 1,
  "createdCount": 1,
  "existingCount": 0
}
```

`sourceEventId`가 있으면 Provider 이벤트 ID, 없으면 선수·이전/현재 팀·유형·이동일 조합으로 SHA-256 키를 만든다. 같은 후보의 재전송은 새 행을 만들지 않고 최신 안전 필드만 갱신하며, 운영자가 이미 선택한 검토 상태와 분류를 덮어쓰지 않는다.

## DB 반영 판정

구단 선수단 동기화가 끝나면 어드민 Server Action이 `reconcile_provider_player_change_candidates`를 호출한다.

- 합류 계열: 대상 구단의 2026 K리그 선수단에 해당 선수가 활성 상태로 존재해야 한다.
- 이탈 계열: 원 구단의 2026 K리그 선수단에 해당 선수가 더 이상 활성 상태가 아니어야 한다.
- 팀 이름만 있는 후보: 자동 판정하지 않는다.
- `db_reflected=false`인 후보는 운영 화면에서 `반영 필요`로 보이고 `반영 완료` 상태를 선택할 수 없다.

현재 시즌·리그 값은 기존 모바일 축구 계약과 같은 `2026`, `kleague`다. 이 범위가 바뀌면 후보 전송과 선수단 동기화 계약을 함께 변경해야 한다.

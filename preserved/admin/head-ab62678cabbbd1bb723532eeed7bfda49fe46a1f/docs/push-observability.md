# Push 전달 관측 연결

`202608300004_push_delivery_observability.sql`은 기존 APNs 전송 흐름을 변경하지 않고 알림 단위 집계 결과를 저장한다. 디바이스 토큰, 사용자 ID, 알림 제목·본문, APNs 응답 본문은 저장하지 않는다.

## 적용 순서

1. 개발 Supabase에 `202608300001`부터 `202608300004`까지 번호 순서대로 적용한다.
2. `push-notification` Edge Function에서 실행 시작 시각과 `crypto.randomUUID()` 요청 ID를 만든다.
3. 토큰이 없는 정상 종료, 전체/부분 성공, 예외 종료 경로에서 `record_push_delivery_run` RPC를 한 번씩 호출한다.
4. 개발 환경에서 성공, 일부 실패, 전체 실패를 각각 발생시킨 뒤 `/system-status`의 Push 카드를 확인한다.
5. 검증 후 같은 변경을 운영 Edge Function에 배포한다.

## RPC 입력 계약

기존 함수가 이미 계산하는 `tokens.length`, `delivered`, `transientFailures.length`, `staleTokens.length`, `deliveredByEnvironment`를 그대로 전달한다.

```ts
await supabase.rpc('record_push_delivery_run', {
  p_notification_id: notificationId ?? null,
  p_targeted_count: tokens.length,
  p_delivered_count: delivered,
  p_failed_count: transientFailures.length,
  p_removed_token_count: staleTokens.length,
  p_delivered_development: deliveredByEnvironment.development,
  p_delivered_production: deliveredByEnvironment.production,
  p_duration_ms: Date.now() - startedAt,
  p_error_code: null,
  p_error_message: null,
  p_request_id: requestId,
  p_completed_at: new Date().toISOString(),
});
```

예외 경로에는 토큰·JWT·사용자 ID·알림 내용을 넣지 않는다. `p_error_code`에는 `APNS_CONFIGURATION_ERROR`, `TOKEN_QUERY_FAILED`처럼 제한된 내부 코드를, `p_error_message`에는 민감정보를 제거한 짧은 설명만 전달한다. 관측 기록 실패가 이미 끝난 Push 전송 결과를 바꾸거나 동일 알림을 재전송하게 해서는 안 되므로 RPC 오류는 별도로 로깅하고 원래 응답은 유지한다.

## 상태 판정

- 최근 30일 기록 없음 또는 스키마 조회 실패: `확인 불가`
- 마지막 실행 전체 실패: `장애`
- 최근 24시간 실제 전달 시도 중 실패율 50% 이상: `장애`
- 일부 실패 또는 마지막 관측이 7일보다 오래됨: `주의`
- 최근 관측이 있고 실패 없음: `정상`

만료·미등록 토큰 제거는 전송 시스템 장애로 계산하지 않는다. 등록 토큰이 없어 전달 시도가 0건이어도 Edge Function 실행 자체가 성공했다면 정상 관측으로 취급한다.

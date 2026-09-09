# Discord 운영 알림

신규 가입자와 새 1:1 문의가 생성되면 Supabase `pg_net`이 Discord Incoming Webhook으로 비동기 알림을 보냅니다. Discord 전송 실패는 원래 가입 또는 문의 저장을 롤백하지 않습니다.

## Discord 설정

1. 알림을 받을 Discord 채널에서 **채널 편집 → 연동 → 웹후크 → 새 웹후크**를 선택합니다.
2. 웹후크 URL을 복사합니다.
3. Supabase Dashboard의 **Database → Vault**에서 아래 이름으로 저장합니다.

```text
discord_admin_notifications_webhook_url
```

값에는 복사한 `https://discord.com/api/webhooks/...` URL을 입력합니다. URL을 `.env` 파일, SQL migration, GitHub Variables 또는 클라이언트 코드에 넣지 않습니다. 개발과 운영 Supabase Vault에는 서로 다른 Discord 채널의 URL을 저장하는 것을 권장합니다.

## 알림 내용

- 신규 가입: 사용자 ID, 가입 시각
- 1:1 문의: 닉네임, 분류, 제목, 문의 내용 1,000자, 문의 ID, 접수 시각
- 사용자 입력에 포함된 `@everyone`, `@here`, 역할 및 사용자 멘션은 Discord 알림을 발생시키지 않습니다.

## 적용과 확인

`202609090002_discord_admin_notifications.sql` migration을 적용한 뒤 실제 개발 계정 가입과 1:1 문의 등록으로 확인합니다. 전송 결과는 Supabase SQL Editor에서 최근 `pg_net` 응답을 조회해 확인할 수 있습니다.

```sql
select id, status_code, error_msg, created
from net._http_response
order by created desc
limit 20;
```

정상 Discord webhook은 보통 `204`를 반환합니다. 오류 응답에도 webhook URL을 로그나 이슈에 복사하지 않습니다.

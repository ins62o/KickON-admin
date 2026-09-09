import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/202609090002_discord_admin_notifications.sql"),
  "utf8",
);

test("신규 가입자와 1:1 문의 INSERT가 Discord 알림을 큐에 넣는다", () => {
  assert.match(migration, /after insert on public\.profiles/);
  assert.match(migration, /after insert on public\.support_inquiries/);
  assert.match(migration, /perform net\.http_post\(/);
  assert.match(migration, /discord_admin_notifications_webhook_url/);
  assert.match(migration, /신규 가입자가 있습니다/);
  assert.match(migration, /새 1:1 문의가 도착했습니다/);
});

test("Discord 알림은 멘션과 비밀 노출을 막고 원래 INSERT를 실패시키지 않는다", () => {
  assert.match(migration, /'allowed_mentions', jsonb_build_object\('parse', jsonb_build_array\(\)\)/);
  assert.match(migration, /webhook_url !~ '\^https:\/\//);
  assert.match(migration, /Avoid[\s\S]*logging SQLERRM/);
  assert.match(migration, /when others then[\s\S]*return new;/);
  assert.doesNotMatch(migration, /new\.email/);
  assert.doesNotMatch(migration, /discord\.com\/api\/webhooks\/[0-9]/);
});

test("1:1 문의 알림은 운영에 필요한 필드만 제한된 길이로 보낸다", () => {
  assert.match(migration, /left\(new\.content, 1000\)/);
  assert.match(migration, /nullif\(trim\(profile\.nickname\), ''\)/);
  assert.match(migration, /'name', '제목'/);
  assert.match(migration, /'name', '문의 ID'/);
  assert.match(migration, /at time zone 'Asia\/Seoul'/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/202609110005_complete_registration_after_profile_setup.sql",
  ),
  "utf8",
);

test("가입 완료는 약관 동의와 응원 팀 및 닉네임을 모두 요구한다", () => {
  assert.match(migration, /new\.signup_consented_at is not null/);
  assert.match(migration, /new\.team_id is not null/);
  assert.match(migration, /nullif\(trim\(new\.nickname\), ''\) is not null/);
});

test("가입 알림은 프로필 생성이 아닌 가입 완료 전환에 전송한다", () => {
  assert.match(
    migration,
    /after update of registration_completed_at on public\.profiles/,
  );
  assert.match(
    migration,
    /old\.registration_completed_at is null[\s\S]*new\.registration_completed_at is not null/,
  );
  assert.doesNotMatch(migration, /after insert on public\.profiles/);
});

test("관리자 가입자 집계와 목록은 가입 완료 프로필만 사용한다", () => {
  assert.match(
    migration,
    /admin_get_dashboard_summary[\s\S]*profile\.registration_completed_at is not null/,
  );
  assert.match(
    migration,
    /where profile\.registration_completed_at is not null[\s\S]*normalized_query = ''/,
  );
  assert.doesNotMatch(migration, /'응원 팀 미선택'::text/);
});

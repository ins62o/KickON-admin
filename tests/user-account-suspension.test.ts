import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("사용자 조치 화면은 커뮤니티 정지와 계정 정지를 구분한다", () => {
  const form = source("src/components/admin/user-moderation-form.tsx");
  const detail = source("src/app/(console)/users/detail/page.tsx");

  assert.match(form, /value="SUSPEND"[^>]*>커뮤니티 활동 정지/);
  assert.match(form, /value="ACCOUNT_SUSPEND"[^>]*>계정 전체 정지/);
  assert.match(form, /value="UNSUSPEND"[^>]*>커뮤니티 정지 해제/);
  assert.match(form, /value="ACCOUNT_UNSUSPEND"[^>]*>계정 정지 해제/);
  assert.doesNotMatch(form, /value="WARN"/);
  assert.match(form, /\["SUSPEND", "ACCOUNT_SUSPEND"\]\.includes\(selectedAction\)/);
  assert.match(form, /htmlFor="user-moderation-nickname"[^>]*>닉네임/);
  assert.match(form, /<Select value=\{userId\}>/);
  assert.match(form, /id="user-moderation-duration"/);
  assert.match(form, /suspensionDayOptions\.map\(\(days\) => <SelectItem/);
  assert.match(form, /pendingLabel="실행 중…"[\s\S]*>실행<\/ActionSubmit>/);
  assert.match(form, /className="min-w-28 px-6"/);
  assert.match(form, /className="min-h-28 px-4 py-3\.5 text-sm"/);
  assert.match(form, /export function UserModerationDialog/);
  assert.match(form, /<DialogTrigger asChild>/);
  assert.match(form, />\s*정지\s*<\/Button>/);
  assert.doesNotMatch(form, /<Ban/);
  assert.match(form, /<DialogTitle[^>]*>사용자 조치<\/DialogTitle>/);
  assert.match(detail, /관련 신고<\/Link>/);
  assert.doesNotMatch(detail, /<ShieldAlert className="size-4" \/>관련 신고/);
  assert.match(detail, /variant="outline" size="default"/);
  assert.match(detail, /<UserModerationDialog userId=\{user\.id\}/);
  assert.doesNotMatch(detail, /id="moderate-user-title"/);
});

test("사용자 조치 입력은 정지와 해제 유형만 허용한다", () => {
  const actions = source("src/lib/admin/actions.ts");

  assert.match(actions, /\["SUSPEND", "UNSUSPEND", "ACCOUNT_SUSPEND", "ACCOUNT_UNSUSPEND"\]\.includes\(action\)/);
  assert.doesNotMatch(actions, /\["WARN", "SUSPEND"/);
});

test("계정 정지는 브라우저 RPC가 아니라 서버 전용 관리자 API를 사용한다", () => {
  const actions = source("src/lib/admin/actions.ts");
  const lambda = source("server/admin-api/lambda.ts");

  assert.match(actions, /callAdminAction<AdminActionState>\("applyUserAccountAction", formData\)/);
  assert.match(lambda, /SUPABASE_ADMIN_SECRET_KEY\?\.trim\(\)[\s\S]*SUPABASE_METRICS_SECRET_KEY\?\.trim\(\)/);
  assert.match(lambda, /auth\.admin\.getUserById\(userId\)/);
  assert.match(lambda, /auth\.admin\.updateUserById\(userId, \{ ban_duration: banDuration \}\)/);
  assert.match(lambda, /p_action: action/);
  assert.match(lambda, /previousBanDuration\(bannedUntil\)/);
});

test("계정 정지 마이그레이션은 상태, 접근 차단, 감사 조치를 함께 정의한다", () => {
  const migration = source("supabase/migrations/202609090001_account_suspensions.sql");

  assert.match(migration, /account_suspended_until timestamptz/);
  assert.match(migration, /'ACCOUNT_SUSPEND', 'ACCOUNT_UNSUSPEND'/);
  assert.match(migration, /create or replace function public\.can_current_user_access_app\(\)/);
  assert.match(migration, /as restrictive for all to authenticated using \(public\.can_current_user_access_app\(\)\)/);
  assert.match(migration, /data_center_enforce_account_suspension/);
  assert.match(migration, /when state\.account_suspended_until > now\(\) then 'ACCOUNT_SUSPENDED'/);
  assert.match(migration, /'USER_' \|\| normalized_action/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { getServiceAccountIds } from "../src/lib/admin/user-visibility.ts";

test("관리자 멤버십과 이메일 로그인 계정을 일반 가입자에서 제외한다", () => {
  const excludedIds = getServiceAccountIds(
    new Set(["registered-admin"]),
    new Map([
      ["email-admin", "email"],
      ["apple-user", "apple"],
      ["kakao-user", "kakao"],
    ]),
  );

  assert.deepEqual([...excludedIds].sort(), ["email-admin", "registered-admin"]);
});

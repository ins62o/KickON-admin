import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../src/lib/auth/safe-next-path.ts";

test("로그인 복귀 경로는 현재 관리자 사이트 안에 남는다", () => {
  for (const value of ["/\\external.example", "/\n/external.example", "//external.example", "https://external.example", "javascript:alert(1)", null]) {
    assert.equal(safeNextPath(value, ""), "/", String(value));
  }
  assert.equal(new URL(safeNextPath("/\\external.example", ""), "https://admin.kickon.kr").origin, "https://admin.kickon.kr");
});

test("개발 basePath를 제거한 결과도 외부 경로가 될 수 없다", () => {
  assert.equal(safeNextPath("/development//external.example", "/development"), "/");
  assert.equal(safeNextPath("/development/\\external.example", "/development"), "/");
});

test("정상 복귀 경로의 검색 조건과 앵커 및 basePath 동작은 유지한다", () => {
  assert.equal(safeNextPath("/users/?q=test#profile", ""), "/users/?q=test#profile");
  assert.equal(safeNextPath("/development/users/?q=test#profile", "/development"), "/users/?q=test#profile");
  assert.equal(safeNextPath("/development", "/development"), "/");
  assert.equal(safeNextPath("/data-management/", "/development"), "/data-management/");
});

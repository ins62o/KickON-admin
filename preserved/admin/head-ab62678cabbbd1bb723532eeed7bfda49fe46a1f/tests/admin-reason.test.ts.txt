import assert from "node:assert/strict";
import test from "node:test";

import { reasonOrDefault } from "../src/lib/admin/reason.ts";

test("관리자 사유는 입력하면 그대로 쓴다", () => {
  assert.equal(reasonOrDefault("  사용자 제보 확인  ", "동기화 실행"), "사용자 제보 확인");
});

test("사유를 비우면 작업 이름으로 자동 기록한다", () => {
  assert.equal(reasonOrDefault("", "선수 정보 수정"), "관리자 콘솔에서 선수 정보 수정");
  assert.equal(reasonOrDefault(null, "선수 정보 수정"), "관리자 콘솔에서 선수 정보 수정");
  assert.equal(reasonOrDefault("   ", "선수 정보 수정"), "관리자 콘솔에서 선수 정보 수정");
});

test("1~2자 사유는 버리지 않고 작업 이름과 함께 남긴다", () => {
  assert.equal(reasonOrDefault("ok", "순위 수정"), "관리자 콘솔에서 순위 수정 (ok)");
});

test("긴 사유는 최대 길이에서 자른다", () => {
  assert.equal(reasonOrDefault("가".repeat(600), "보관 기록 정리", 500).length, 500);
});

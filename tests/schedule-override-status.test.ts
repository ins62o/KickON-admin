import assert from "node:assert/strict";
import test from "node:test";

type OverrideStatusModule = typeof import("../src/lib/data/override-status.ts");

const overrideStatus = await import("../src/lib/data/override-status.ts")
  .catch(() => ({} as Partial<OverrideStatusModule>));

const overrides = [
  { id: "active-stadium", releasedAt: null },
  { id: "released-latitude", releasedAt: "2026-09-20T11:00:00.000Z" },
  { id: "active-longitude", releasedAt: null },
];

test("수동 수정 상태는 활성 값만 모달 표시 대상으로 요약한다", () => {
  const summary = overrideStatus.getActiveOverrideStatus?.(overrides);

  assert.deepEqual(summary, {
    active: [overrides[0], overrides[2]],
    count: 2,
    label: "수동 수정값 2개 보기",
  });
});

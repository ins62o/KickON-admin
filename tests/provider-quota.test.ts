import assert from "node:assert/strict";
import test from "node:test";

import { resolveProviderQuota } from "../src/lib/data/provider-quota.ts";

const OBSERVED_AT = "2026-09-03T00:00:00.000Z";

test("리셋 전에는 SportsMonks가 반환한 잔여량과 리셋 시각을 유지한다", () => {
  const quota = resolveProviderQuota({
    observedAt: OBSERVED_AT,
    remaining: 1_988,
    resetsInSeconds: 3_600,
  }, 2_000, Date.parse("2026-09-03T00:30:00.000Z"));

  assert.deepEqual(quota, {
    allowance: 2_000,
    remaining: 1_988,
    resetAt: "2026-09-03T01:00:00.000Z",
  });
});

test("리셋 시각이 지나면 설정된 시간당 한도로 복원한다", () => {
  const quota = resolveProviderQuota({
    observedAt: OBSERVED_AT,
    remaining: 1_988,
    resetsInSeconds: 3_600,
  }, 2_000, Date.parse("2026-09-03T01:00:00.000Z"));

  assert.deepEqual(quota, {
    allowance: 2_000,
    remaining: 2_000,
    resetAt: null,
  });
});

test("리셋이 지났지만 한도가 설정되지 않았다면 오래된 잔여량을 표시하지 않는다", () => {
  const quota = resolveProviderQuota({
    observedAt: OBSERVED_AT,
    remaining: 1_988,
    resetsInSeconds: 3_600,
  }, null, Date.parse("2026-09-03T02:00:00.000Z"));

  assert.deepEqual(quota, {
    allowance: null,
    remaining: null,
    resetAt: null,
  });
});

test("유효한 리셋 정보가 없으면 관측된 잔여량만 사용한다", () => {
  const quota = resolveProviderQuota({
    observedAt: "invalid-date",
    remaining: 1_988,
    resetsInSeconds: 3_600,
  }, 2_000, Date.parse("2026-09-03T02:00:00.000Z"));

  assert.deepEqual(quota, {
    allowance: 2_000,
    remaining: 1_988,
    resetAt: null,
  });
});

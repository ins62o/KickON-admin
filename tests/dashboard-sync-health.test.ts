import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  countUnrecoveredSyncFailures,
  type RecentSyncRunRow,
} from "../src/lib/admin/sync-health.ts";

function run(
  status: string,
  createdAt: string,
  scope: { operationKey: string; leagueId: string } = { operationKey: "full", leagueId: "all" },
): RecentSyncRunRow {
  const failed = status === "failed";
  return {
    job_key: "sync-football-data",
    status,
    failed_count: failed ? 1 : 0,
    error_code: failed ? "sync_failure" : null,
    error_message: failed ? "provider error" : null,
    metadata: { ...scope, season: 2026 },
    created_at: createdAt,
  };
}

test("같은 범위의 최신 성공은 이전 동기화 실패 표시를 해제한다", () => {
  assert.equal(countUnrecoveredSyncFailures([
    run("failed", "2026-09-12T13:00:00Z"),
    run("succeeded", "2026-09-12T14:00:00Z"),
  ]), 0);
});

test("성공 이후의 실패와 다른 범위의 실패는 계속 표시한다", () => {
  assert.equal(countUnrecoveredSyncFailures([
    run("succeeded", "2026-09-12T12:00:00Z"),
    run("failed", "2026-09-12T13:00:00Z"),
    run("failed", "2026-09-12T11:00:00Z", { operationKey: "post-match", leagueId: "all" }),
  ]), 2);
});

test("운영 대시보드 RPC도 같은 범위의 후속 성공을 복구로 처리한다", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/202609120010_clear_recovered_sync_failures.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /not exists \([\s\S]*recovered_run\.created_at > failed_run\.created_at/);
  assert.match(migration, /recovered_run\.status = ''succeeded''/);
  assert.match(migration, /recovered_run\.metadata ->> ''operationKey''/);
  assert.match(migration, /recovered_run\.metadata ->> ''leagueId''/);
});

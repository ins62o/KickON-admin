import assert from "node:assert/strict";
import test from "node:test";

import { buildCronJobs, summarizeCronJobs, type CronRuntimeRow } from "../src/lib/cron/jobs.ts";

const now = new Date("2026-09-26T12:00:30Z");

function row(name: string, schedule: string, patch: Partial<CronRuntimeRow> = {}): CronRuntimeRow {
  return {
    job_id: 1,
    job_name: name,
    schedule,
    active: true,
    last_status: "succeeded",
    last_started_at: "2026-09-26T12:00:00Z",
    last_finished_at: "2026-09-26T12:00:02Z",
    last_message: "1 row",
    failure_count_24h: 0,
    ...patch,
  };
}

test("DB에 실제 등록된 cron을 모두 보여주고 모르는 작업도 이름 그대로 표시한다", () => {
  const jobs = buildCronJobs([
    row("kickon-live-football-sync", "* * * * *"),
    row("kickon-push-outbox-recovery-dev", "* * * * *"),
    row("kickon-something-new", "*/10 * * * *"),
  ], now);
  const byKey = new Map(jobs.map((job) => [job.key, job]));
  assert.equal(byKey.get("kickon-live-football-sync")?.name, "실시간 경기 동기화");
  assert.equal(byKey.get("kickon-push-outbox-recovery-dev")?.name, "푸시 알림 복구");
  assert.equal(byKey.get("kickon-something-new")?.name, "kickon-something-new");
  assert.equal(byKey.get("kickon-something-new")?.scheduleLabel, "10분마다");
  assert.equal(byKey.get("kickon-live-football-sync")?.durationMs, 2_000);
});

test("마이그레이션에 있는데 DB에 없는 작업은 등록 안 됨으로 표시한다", () => {
  const jobs = buildCronJobs([row("kickon-live-football-sync", "* * * * *")], now);
  const squad = jobs.find((job) => job.key === "kickon-team-squad-refresh");
  assert.equal(squad?.state, "missing");
  assert.equal(squad?.registered, false);
  // 수동 등록 작업(푸시 복구)은 없어도 문제로 보지 않는다.
  assert.equal(jobs.some((job) => job.key === "kickon-push-outbox-recovery"), false);
});

test("최근 실행 결과로 상태를 판정하고 문제 있는 작업을 먼저 보여준다", () => {
  const jobs = buildCronJobs([
    row("kickon-live-football-sync", "* * * * *"),
    row("kickon-post-match-football-sync", "*/5 * * * *", { last_status: "failed", last_message: "timeout", failure_count_24h: 3 }),
    row("kickon-football-provider-usage-retention", "17 3 * * *", { last_started_at: "2026-09-24T03:17:00Z" }),
    row("kickon-fixture-cheer-retention", "43 3 * * *", { active: false }),
    row("kickon-team-squad-refresh", "10 19 * * *", { last_status: null, last_started_at: null, last_finished_at: null }),
    row("kickon-team-squad-retry", "15-40/5 19 * * *", { last_status: "running", last_finished_at: null }),
  ], now);
  const state = (key: string) => jobs.find((job) => job.key === key)?.state;
  assert.equal(state("kickon-live-football-sync"), "normal");
  assert.equal(state("kickon-post-match-football-sync"), "failed");
  assert.equal(state("kickon-football-provider-usage-retention"), "delayed");
  assert.equal(state("kickon-fixture-cheer-retention"), "inactive");
  assert.equal(state("kickon-team-squad-refresh"), "waiting");
  assert.equal(state("kickon-team-squad-retry"), "running");
  assert.equal(jobs[0].state, "failed");
  assert.equal(jobs.find((job) => job.key === "kickon-fixture-cheer-retention")?.nextRunAt, null);

  const summary = summarizeCronJobs(jobs);
  assert.equal(summary.failed, 1);
  assert.equal(summary.delayed, 1);
  assert.ok(summary.missing >= 1);
  assert.equal(summary.inactive, 1);
});

test("실행 기록을 못 읽으면 선언된 작업만 확인 불가로 보여준다", () => {
  const jobs = buildCronJobs(null, now);
  assert.ok(jobs.length >= 8);
  assert.ok(jobs.every((job) => job.state === "unknown"));
});

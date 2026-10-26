import { cronMissedLatestRun, describeCronSchedule, nextCronOccurrence } from "./schedule.ts";

/** Row shape of public.get_admin_cron_jobs(). */
export type CronRuntimeRow = {
  job_id: number;
  job_name: string;
  schedule: string;
  active: boolean;
  last_status: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_message: string | null;
  failure_count_24h: number;
};

export type CronJobState =
  | "failed"
  | "delayed"
  | "missing"
  | "running"
  | "waiting"
  | "inactive"
  | "unknown"
  | "normal";

export type CronJobView = {
  key: string;
  name: string;
  description: string | null;
  expression: string;
  scheduleLabel: string;
  registered: boolean;
  active: boolean | null;
  lastResult: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  durationMs: number | null;
  lastMessage: string | null;
  failureCount24h: number | null;
  nextRunAt: string | null;
  state: CronJobState;
};

type CatalogEntry = {
  key: string;
  name: string;
  description: string;
  expression: string;
  /** Declared by a migration, so its absence from pg_cron is a problem. */
  expected: boolean;
};

// Friendly names for known jobs. The list shown is whatever pg_cron actually has.
const CRON_JOB_CATALOG: CatalogEntry[] = [
  { key: "kickon-live-football-sync", name: "실시간 경기 동기화", description: "경기 중 점수·이벤트·라인업 갱신", expression: "* * * * *", expected: true },
  { key: "kickon-post-match-football-sync", name: "경기 종료 후 동기화", description: "끝난 경기 기록과 순위 보강", expression: "*/5 * * * *", expected: true },
  { key: "kickon-initial-football-history-backfill", name: "지난 시즌 데이터 채우기", description: "빠진 과거 경기 기록 다시 가져오기", expression: "*/5 * * * *", expected: true },
  { key: "kickon-team-squad-refresh", name: "선수단 갱신", description: "구단별 선수 명단 하루 한 번 갱신", expression: "10 19 * * *", expected: true },
  { key: "kickon-team-squad-retry", name: "선수단 갱신 재시도", description: "덜 끝난 구단 선수단 다시 시도", expression: "15-40/5 19 * * *", expected: true },
  { key: "kickon-team-metrics-reconciliation", name: "팀 순위 지표 보정", description: "순위 보조 지표 하루 한 번 맞추기", expression: "40 19 * * *", expected: true },
  { key: "kickon-football-provider-usage-retention", name: "API 사용 기록 정리", description: "60일 지난 SportsMonks 호출 기록 삭제", expression: "17 3 * * *", expected: true },
  { key: "kickon-fixture-cheer-retention", name: "경기 응원 메시지 정리", description: "48시간 지난 응원 메시지 삭제", expression: "43 3 * * *", expected: true },
  { key: "kickon-push-outbox-recovery", name: "푸시 알림 복구", description: "보내지 못한 푸시 알림 다시 처리", expression: "* * * * *", expected: false },
  { key: "kickon-attendance-reminder", name: "직관인증 알림", description: "킥오프 2시간 전 두 팀 팬에게 직관인증 푸시", expression: "*/5 * * * *", expected: true },
];

const STATE_ORDER: CronJobState[] = ["failed", "delayed", "missing", "running", "waiting", "inactive", "unknown", "normal"];

function catalogEntry(jobName: string) {
  return CRON_JOB_CATALOG.find((entry) => entry.key === jobName || `${entry.key}-dev` === jobName);
}

function jobState(row: CronRuntimeRow, now: Date): CronJobState {
  if (!row.active) return "inactive";
  const result = row.last_status?.toLowerCase() ?? null;
  if (!result) return "waiting";
  if (result === "running" || result === "starting") return "running";
  if (result !== "succeeded") return "failed";
  if (cronMissedLatestRun(row.schedule, row.last_started_at, now)) return "delayed";
  return "normal";
}

function durationMs(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return null;
  const duration = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) ? Math.max(0, duration) : null;
}

/**
 * Every pg_cron job named kickon-*, plus migration-declared jobs missing from
 * pg_cron. `rows === null` means the runtime could not be read.
 */
export function buildCronJobs(rows: CronRuntimeRow[] | null, now = new Date()): CronJobView[] {
  const nextRun = (expression: string, active: boolean | null) => (
    active === false ? null : nextCronOccurrence(expression, now)?.toISOString() ?? null
  );

  if (rows === null) {
    return CRON_JOB_CATALOG.filter((entry) => entry.expected).map((entry) => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      expression: entry.expression,
      scheduleLabel: describeCronSchedule(entry.expression),
      registered: false,
      active: null,
      lastResult: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      durationMs: null,
      lastMessage: null,
      failureCount24h: null,
      nextRunAt: nextRun(entry.expression, null),
      state: "unknown",
    }));
  }

  const registered = rows.map((row): CronJobView => {
    const entry = catalogEntry(row.job_name);
    return {
      key: row.job_name,
      name: entry?.name ?? row.job_name,
      description: entry?.description ?? null,
      expression: row.schedule,
      scheduleLabel: describeCronSchedule(row.schedule),
      registered: true,
      active: row.active,
      lastResult: row.last_status,
      lastStartedAt: row.last_started_at,
      lastFinishedAt: row.last_finished_at,
      durationMs: durationMs(row.last_started_at, row.last_finished_at),
      lastMessage: row.last_message ? row.last_message.slice(0, 2_000) : null,
      failureCount24h: Number(row.failure_count_24h ?? 0),
      nextRunAt: nextRun(row.schedule, row.active),
      state: jobState(row, now),
    };
  });

  const registeredEntries = new Set(registered.map((job) => catalogEntry(job.key)?.key ?? job.key));
  const missing = CRON_JOB_CATALOG
    .filter((entry) => entry.expected && !registeredEntries.has(entry.key))
    .map((entry): CronJobView => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      expression: entry.expression,
      scheduleLabel: describeCronSchedule(entry.expression),
      registered: false,
      active: null,
      lastResult: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      durationMs: null,
      lastMessage: null,
      failureCount24h: null,
      nextRunAt: null,
      state: "missing",
    }));

  const catalogOrder = (key: string) => {
    const index = CRON_JOB_CATALOG.findIndex((entry) => entry.key === (catalogEntry(key)?.key ?? key));
    return index === -1 ? CRON_JOB_CATALOG.length : index;
  };
  return [...registered, ...missing].sort((left, right) => (
    STATE_ORDER.indexOf(left.state) - STATE_ORDER.indexOf(right.state)
    || catalogOrder(left.key) - catalogOrder(right.key)
    || left.key.localeCompare(right.key)
  ));
}

export function summarizeCronJobs(jobs: CronJobView[]) {
  const count = (state: CronJobState) => jobs.filter((job) => job.state === state).length;
  return {
    total: jobs.length,
    normal: count("normal"),
    problems: count("failed") + count("delayed") + count("missing"),
    failed: count("failed"),
    delayed: count("delayed"),
    missing: count("missing"),
    inactive: count("inactive"),
  };
}

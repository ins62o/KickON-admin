"use client";

import { CURRENT_SEASON } from "@/lib/football/config";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ConsoleEnvironment } from "@/lib/environment";
import { getSupabaseProjectMetrics, type SupabaseProjectMetrics } from "@/lib/supabase/project-metrics";
import { getSupabaseServiceHealth } from "@/lib/supabase/service-health";
import { getKickonApiHealth } from "@/lib/health/kickon-api";
import { formatKoreaDateTime } from "@/lib/format";
import { assessProviderHealth, type ProviderHealthAssessment } from "./provider-health";
import { assessCronSystemHealth } from "./cron-system-health";
import { getPushDeliveryData, type PushDeliveryData } from "./push-delivery";
import { assessPushDeliveryHealth, type PushDeliveryHealthAssessment } from "./push-health";
import { getSupabaseConnection } from "./supabase";
import { buildProviderUsageTrends, type ProviderUsageTrendSeries } from "./provider-usage-trends";
import { resolveProviderQuota } from "./provider-quota";
import type { HealthStatus } from "./types";

type CronRpcRow = {
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

type ProviderUsageRow = {
  observed_at: string;
  source: string;
  endpoint: string;
  requested_entity: string | null;
  remaining: number | null;
  resets_in_seconds: number | null;
  status_code: number;
};

type SyncStateRow = {
  sync_key: string;
  last_attempted_at: string;
  last_succeeded_at: string | null;
  last_error: string | null;
};

export type CronJobRecord = {
  key: string;
  name: string;
  role: string;
  expression: string;
  environment: "development" | "production";
  active: boolean | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  nextRunAt: string | null;
  durationMs: number | null;
  lastResult: string | null;
  lastMessage: string | null;
  failureCount24h: number | null;
  status: HealthStatus;
  delayed: boolean;
  source: "pg_cron" | "migration";
};

export type CronData = {
  jobs: CronJobRecord[];
  environment: "development" | "production";
  runtimeConnected: boolean;
  error: string | null;
};

export type ProviderUsageData = {
  connected: boolean;
  error: string | null;
  observedThrough: string | null;
  latestStatusCode: number | null;
  latestEndpoint: string | null;
  currentPlan: string | null;
  allowance: number | null;
  remaining: number | null;
  resetAt: string | null;
  recordCount: number | null;
  todayCount: number | null;
  monthCount: number | null;
  sevenDayCount: number | null;
  sevenDayAverage: number | null;
  thirtyDayCount: number | null;
  sixtyDayCount: number | null;
  failedCount: number | null;
  rateLimitedCount: number | null;
  clientErrorCount: number | null;
  serverErrorCount: number | null;
  truncated: boolean;
  entities: Array<{
    entity: string;
    source: string;
    endpoint: string;
    remaining: number | null;
    resetAt: string | null;
    statusCode: number;
    observedAt: string;
  }>;
  sourceEndpoints: Array<{
    key: string;
    source: string;
    endpoint: string;
    requests: number;
    failures: number;
    rateLimited: number;
    clientErrors: number;
    serverErrors: number;
    lastObservedAt: string;
  }>;
  last24Hours: {
    requests: number | null;
    previousRequests: number | null;
    requestChangePercent: number | null;
    failures: number | null;
    rateLimited: number | null;
    clientErrors: number | null;
    serverErrors: number | null;
    peakHourAt: string | null;
    peakHourLabel: string | null;
    peakHourRequests: number | null;
  };
  monthly: Array<{
    month: string;
    label: string;
    requests: number;
    failures: number;
    rateLimited: number;
    clientErrors: number;
    serverErrors: number;
  }>;
  trends: ProviderUsageTrendSeries;
};

export type SupabaseResourceMetric = {
  label: string;
  value: number | null;
  source: string;
};

export type SupabaseUsageData = {
  connected: boolean;
  error: string | null;
  rowCounts: SupabaseResourceMetric[];
  metricsConfigured: boolean;
  metricsCheckedAt: string | null;
  infrastructure: Array<{
    key: string;
    label: string;
    value: number | null;
    unit: "bytes" | "count" | null;
    detail: string;
    source: string;
    status: "available" | "unavailable" | "error";
  }>;
};

export type SystemComponentStatus = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  checkedAt: string;
  source: string;
  latencyMs: number | null;
};

export type OperationalDashboardSnapshot = {
  registeredUsers: number | null;
  errorEvents24h: number | null;
  openReports: number | null;
  providerRemaining: number | null;
  providerObservedAt: string | null;
  latestSyncAt: string | null;
  failedSyncCount: number | null;
  databaseSizeBytes: number | null;
  supabaseMetricsConfigured: boolean;
};

const CRON_CATALOG = [
  { key: "kickon-live-football-sync", name: "실시간 경기 동기화", role: "라이브 스코어·이벤트·라인업 갱신", expression: "* * * * *", syncKey: "sportmonks-live" },
  { key: "kickon-post-match-football-sync", name: "경기 종료 후 동기화", role: "종료 경기 기록과 순위 보강", expression: "*/5 * * * *", syncKey: `sportmonks-post-match-${CURRENT_SEASON}` },
  { key: "kickon-initial-football-history-backfill", name: "과거 시즌 초기 적재", role: `2024~${CURRENT_SEASON} 시즌 누락 데이터 재시도`, expression: "*/5 * * * *", syncKey: `sportmonks-history-2024-${CURRENT_SEASON}` },
  { key: "kickon-football-provider-usage-retention", name: "API 사용 기록 정리", role: "60일이 지난 SportsMonks 호출 기록 삭제", expression: "17 3 * * *", syncKey: null },
  { key: "kickon-fixture-cheer-retention", name: "경기 응원 메시지 정리", role: "48시간이 지난 경기 응원 메시지 삭제", expression: "43 3 * * *", syncKey: null },
] as const;

const COUNT_TABLES = [
  ["teams", "구단"],
  ["team_players", "선수 시즌 레코드"],
  ["fixtures", "경기"],
  ["league_standings", "팀 순위"],
  ["player_scoring_stats", "개인 순위"],
  ["profiles", "사용자"],
  ["posts", "게시글"],
  ["comments", "댓글"],
  ["notifications", "알림"],
  ["push_tokens", "푸시 토큰"],
] as const;

async function getAdminReadClient(environment?: ConsoleEnvironment): Promise<SupabaseClient | null> {
  return getBrowserSupabaseClient(environment);
}

function isMissingAdminRpc(code?: string) {
  return code === "PGRST202" || code === "42883" || code === "42501";
}

function nextCronRun(expression: string, now = new Date()) {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);

  if (expression === "* * * * *") {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
    return next.toISOString();
  }
  if (expression === "*/5 * * * *") {
    next.setUTCMinutes(Math.floor(next.getUTCMinutes() / 5) * 5 + 5);
    return next.toISOString();
  }

  const hourly = expression.match(/^(\d{1,2}) \* \* \* \*$/);
  if (hourly) {
    const minute = Number(hourly[1]);
    next.setUTCMinutes(minute);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
    return next.toISOString();
  }

  const daily = expression.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (daily) {
    next.setUTCHours(Number(daily[2]), Number(daily[1]), 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.toISOString();
  }
  return null;
}

function cronDelayMs(expression: string) {
  if (expression === "* * * * *") return 3 * 60_000;
  if (expression === "*/5 * * * *") return 15 * 60_000;
  if (/^\d{1,2} \* \* \* \*$/.test(expression)) return 3 * 60 * 60_000;
  return 36 * 60 * 60_000;
}

function cronIsDelayed(active: boolean | null, lastFinishedAt: string | null, expression: string) {
  if (active === false || !lastFinishedAt) return false;
  const finishedAt = new Date(lastFinishedAt).getTime();
  return Number.isFinite(finishedAt) && Date.now() - finishedAt > cronDelayMs(expression);
}

function cronMessage(value: string | null | undefined) {
  return value ? value.slice(0, 2_000) : null;
}

function cronHealth(active: boolean | null, result: string | null, lastFinishedAt: string | null, delayed: boolean): HealthStatus {
  if (active === false) return "unknown";
  if (result && !["succeeded", "running"].includes(result.toLowerCase())) return "danger";
  if (result?.toLowerCase() === "running") return "warning";
  if (!lastFinishedAt) return "unknown";
  if (delayed) return "warning";
  return "normal";
}

export const getCronData = cache(async (): Promise<CronData> => {
  const connection = getSupabaseConnection();
  const client = await getAdminReadClient();
  if (!client) {
    return {
      jobs: CRON_CATALOG.map((job) => ({
        key: job.key, name: job.name, role: job.role, expression: job.expression,
        environment: connection.environment, active: null, lastStartedAt: null, lastFinishedAt: null,
        nextRunAt: nextCronRun(job.expression), durationMs: null, lastResult: null, lastMessage: null,
        failureCount24h: null, status: "unknown", delayed: false, source: "migration",
      })),
      environment: connection.environment,
      runtimeConnected: false,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
    };
  }

  const [cronResult, syncResult] = await Promise.all([
    client.rpc("get_admin_cron_jobs"),
    client.from("football_sync_state").select("sync_key,last_attempted_at,last_succeeded_at,last_error"),
  ]);
  const runtimeRows = (cronResult.data ?? []) as CronRpcRow[];
  const runtimeByKey = new Map(runtimeRows.map((row) => [row.job_name, row]));
  const syncByKey = new Map(((syncResult.data ?? []) as SyncStateRow[]).map((row) => [row.sync_key, row]));

  const jobs = CRON_CATALOG.map((definition): CronJobRecord => {
    const runtime = runtimeByKey.get(definition.key);
    const sync = definition.syncKey ? syncByKey.get(definition.syncKey) : null;
    const lastStartedAt = runtime?.last_started_at ?? sync?.last_attempted_at ?? null;
    const lastFinishedAt = runtime?.last_finished_at ?? sync?.last_succeeded_at ?? null;
    const lastResult = runtime?.last_status ?? (sync?.last_error ? "failed" : sync?.last_succeeded_at ? "succeeded" : null);
    const expression = runtime?.schedule ?? definition.expression;
    const active = runtime?.active ?? null;
    const delayed = cronIsDelayed(active, lastFinishedAt, expression);
    return {
      key: definition.key,
      name: definition.name,
      role: definition.role,
      expression,
      environment: connection.environment,
      active,
      lastStartedAt,
      lastFinishedAt,
      nextRunAt: nextCronRun(expression),
      durationMs: runtime?.last_started_at && runtime.last_finished_at
        ? Math.max(0, new Date(runtime.last_finished_at).getTime() - new Date(runtime.last_started_at).getTime())
        : null,
      lastResult,
      lastMessage: cronMessage(runtime?.last_message ?? sync?.last_error),
      failureCount24h: runtime?.failure_count_24h ?? null,
      status: cronHealth(active, lastResult, lastFinishedAt, delayed),
      delayed,
      source: runtime ? "pg_cron" : "migration",
    };
  });

  return {
    jobs,
    environment: connection.environment,
    runtimeConnected: !cronResult.error,
    error: cronResult.error
      ? isMissingAdminRpc(cronResult.error.code)
        ? "관리자 크론 조회 RPC 적용이 필요합니다. 현재는 마이그레이션에 선언된 작업만 표시합니다."
        : "pg_cron 실행 상태를 조회할 수 없습니다."
      : null,
  };
});

const EMPTY_PROVIDER_TRENDS = buildProviderUsageTrends([]);

type ProviderErrorTally = {
  failures: number;
  rateLimited: number;
  clientErrors: number;
  serverErrors: number;
};

const PROVIDER_USAGE_LIMIT = 20_000;
const KOREA_OFFSET_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

function emptyProviderUsage(error: string): ProviderUsageData {
  return {
    connected: false,
    error,
    observedThrough: null,
    latestStatusCode: null,
    latestEndpoint: null,
    currentPlan: null,
    allowance: null,
    remaining: null,
    resetAt: null,
    recordCount: null,
    todayCount: null,
    monthCount: null,
    sevenDayCount: null,
    sevenDayAverage: null,
    thirtyDayCount: null,
    sixtyDayCount: null,
    failedCount: null,
    rateLimitedCount: null,
    clientErrorCount: null,
    serverErrorCount: null,
    truncated: false,
    entities: [],
    sourceEndpoints: [],
    last24Hours: {
      requests: null,
      previousRequests: null,
      requestChangePercent: null,
      failures: null,
      rateLimited: null,
      clientErrors: null,
      serverErrors: null,
      peakHourAt: null,
      peakHourLabel: null,
      peakHourRequests: null,
    },
    monthly: [],
    trends: EMPTY_PROVIDER_TRENDS,
  };
}

function koreaDayKey(value: number) {
  return new Date(value + KOREA_OFFSET_MS).toISOString().slice(0, 10);
}

function koreaMonthKey(value: number) {
  return new Date(value + KOREA_OFFSET_MS).toISOString().slice(0, 7);
}

function providerQuota(row: ProviderUsageRow | null, allowance: number | null, nowMs: number) {
  return resolveProviderQuota(row ? {
    observedAt: row.observed_at,
    remaining: row.remaining,
    resetsInSeconds: row.resets_in_seconds,
  } : null, allowance, nowMs);
}

function safeProviderEndpoint(value: string) {
  const withoutQuery = value.split(/[?#]/, 1)[0];
  return withoutQuery
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .slice(0, 500);
}

function emptyErrorTally(): ProviderErrorTally {
  return { failures: 0, rateLimited: 0, clientErrors: 0, serverErrors: 0 };
}

function addProviderStatus(tally: ProviderErrorTally, statusCode: number) {
  if (statusCode >= 400) tally.failures += 1;
  if (statusCode === 429) tally.rateLimited += 1;
  if (statusCode >= 400 && statusCode < 500) tally.clientErrors += 1;
  if (statusCode >= 500 && statusCode < 600) tally.serverErrors += 1;
}

function newerProviderRow(current: ProviderUsageRow | null, candidate: ProviderUsageRow) {
  if (!current) return candidate;
  return new Date(candidate.observed_at).getTime() > new Date(current.observed_at).getTime()
    ? candidate
    : current;
}

export const getProviderUsageData = cache(async (
  environment?: ConsoleEnvironment,
): Promise<ProviderUsageData> => {
  const client = await getAdminReadClient(environment);
  if (!client) return emptyProviderUsage("Supabase 환경 변수가 설정되지 않았습니다.");

  const now = new Date();
  const nowMs = now.getTime();
  const configuredAllowanceValue = Number(process.env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE);
  const configuredAllowance = Number.isFinite(configuredAllowanceValue) && configuredAllowanceValue > 0
    ? configuredAllowanceValue
    : null;
  const since = new Date(nowMs - 60 * DAY_MS).toISOString();
  const result = await client.rpc("get_admin_provider_usage", { since_at: since });
  if (result.error) {
    return emptyProviderUsage(isMissingAdminRpc(result.error.code)
      ? "관리자 API 사용량 RPC 또는 운영 스키마 적용이 필요합니다."
      : "SportsMonks 사용 기록을 조회할 수 없습니다.");
  }

  const rows = (result.data ?? []) as ProviderUsageRow[];
  const validRows = rows.filter((row) => {
    const observedAt = new Date(row.observed_at).getTime();
    return Number.isFinite(observedAt) && observedAt <= nowMs;
  });
  const trends = buildProviderUsageTrends(validRows, now);
  let latestRow: ProviderUsageRow | null = null;
  let latestWithQuota: ProviderUsageRow | null = null;
  const endpointMap = new Map<string, {
    source: string;
    endpoint: string;
    requests: number;
    lastObservedAt: string;
    errors: ProviderErrorTally;
  }>();
  const entityMap = new Map<string, { latest: ProviderUsageRow; quota: ProviderUsageRow | null }>();
  const monthlyMap = new Map<string, { requests: number; errors: ProviderErrorTally }>();
  const totalErrors = emptyErrorTally();
  const last24Errors = emptyErrorTally();
  let todayCount = 0;
  let monthCount = 0;
  let sevenDayCount = 0;
  let thirtyDayCount = 0;
  let last24Count = 0;
  let previous24Count = 0;
  const todayKey = koreaDayKey(nowMs);
  const currentMonthKey = koreaMonthKey(nowMs);

  for (const row of validRows) {
    const observedAt = new Date(row.observed_at).getTime();
    latestRow = newerProviderRow(latestRow, row);
    if (row.remaining !== null || row.resets_in_seconds !== null) {
      latestWithQuota = newerProviderRow(latestWithQuota, row);
    }

    const entityKey = row.requested_entity?.trim() || "미지정";
    const entity = entityMap.get(entityKey);
    entityMap.set(entityKey, {
      latest: newerProviderRow(entity?.latest ?? null, row),
      quota: row.remaining !== null || row.resets_in_seconds !== null
        ? newerProviderRow(entity?.quota ?? null, row)
        : entity?.quota ?? null,
    });

    const safeEndpoint = safeProviderEndpoint(row.endpoint);
    const endpointKey = `${row.source}\u0000${safeEndpoint}`;
    const endpoint = endpointMap.get(endpointKey) ?? {
      source: row.source,
      endpoint: safeEndpoint,
      requests: 0,
      lastObservedAt: row.observed_at,
      errors: emptyErrorTally(),
    };
    endpoint.requests += 1;
    if (observedAt > new Date(endpoint.lastObservedAt).getTime()) endpoint.lastObservedAt = row.observed_at;
    addProviderStatus(endpoint.errors, row.status_code);
    endpointMap.set(endpointKey, endpoint);

    const monthKey = koreaMonthKey(observedAt);
    const monthly = monthlyMap.get(monthKey) ?? { requests: 0, errors: emptyErrorTally() };
    monthly.requests += 1;
    addProviderStatus(monthly.errors, row.status_code);
    monthlyMap.set(monthKey, monthly);

    addProviderStatus(totalErrors, row.status_code);
    if (koreaDayKey(observedAt) === todayKey) todayCount += 1;
    if (monthKey === currentMonthKey) monthCount += 1;
    if (observedAt >= nowMs - 7 * DAY_MS) sevenDayCount += 1;
    if (observedAt >= nowMs - 30 * DAY_MS) thirtyDayCount += 1;
    if (observedAt >= nowMs - DAY_MS) {
      last24Count += 1;
      addProviderStatus(last24Errors, row.status_code);
    } else if (observedAt >= nowMs - 2 * DAY_MS) {
      previous24Count += 1;
    }
  }

  const peakHour = trends["24h"].reduce<(typeof trends)["24h"][number] | null>(
    (peak, bucket) => !peak || bucket.requests > peak.requests ? bucket : peak,
    null,
  );
  const requestChangePercent = previous24Count === 0
    ? last24Count === 0 ? 0 : null
    : Math.round(((last24Count - previous24Count) / previous24Count) * 1_000) / 10;
  const currentQuota = providerQuota(latestWithQuota, configuredAllowance, nowMs);

  return {
    connected: true,
    error: null,
    observedThrough: latestRow?.observed_at ?? null,
    latestStatusCode: latestRow?.status_code ?? null,
    latestEndpoint: latestRow?.requested_entity || (latestRow ? safeProviderEndpoint(latestRow.endpoint) : null),
    currentPlan: null,
    allowance: currentQuota.allowance,
    remaining: currentQuota.remaining,
    resetAt: currentQuota.resetAt,
    recordCount: rows.length,
    todayCount,
    monthCount,
    sevenDayCount,
    sevenDayAverage: Math.round((sevenDayCount / 7) * 10) / 10,
    thirtyDayCount,
    sixtyDayCount: validRows.length,
    failedCount: totalErrors.failures,
    rateLimitedCount: totalErrors.rateLimited,
    clientErrorCount: totalErrors.clientErrors,
    serverErrorCount: totalErrors.serverErrors,
    truncated: rows.length >= PROVIDER_USAGE_LIMIT,
    entities: [...entityMap.entries()]
      .map(([entity, state]) => {
        const observation = state.quota ?? state.latest;
        const quota = providerQuota(observation, configuredAllowance, nowMs);
        return {
          entity,
          source: observation.source,
          endpoint: safeProviderEndpoint(observation.endpoint),
          remaining: quota.remaining,
          resetAt: quota.resetAt,
          statusCode: observation.status_code,
          observedAt: observation.observed_at,
        };
      })
      .sort((a, b) => a.entity.localeCompare(b.entity, "ko")),
    sourceEndpoints: [...endpointMap.entries()]
      .map(([, value]) => ({
        key: `${encodeURIComponent(value.source)}::${encodeURIComponent(value.endpoint)}`,
        source: value.source,
        endpoint: value.endpoint,
        requests: value.requests,
        failures: value.errors.failures,
        rateLimited: value.errors.rateLimited,
        clientErrors: value.errors.clientErrors,
        serverErrors: value.errors.serverErrors,
        lastObservedAt: value.lastObservedAt,
      }))
      .sort((a, b) => b.requests - a.requests || a.source.localeCompare(b.source)),
    last24Hours: {
      requests: last24Count,
      previousRequests: previous24Count,
      requestChangePercent,
      failures: last24Errors.failures,
      rateLimited: last24Errors.rateLimited,
      clientErrors: last24Errors.clientErrors,
      serverErrors: last24Errors.serverErrors,
      peakHourAt: peakHour && peakHour.requests > 0 ? peakHour.at : null,
      peakHourLabel: peakHour && peakHour.requests > 0 ? peakHour.label : null,
      peakHourRequests: peakHour && peakHour.requests > 0 ? peakHour.requests : null,
    },
    monthly: [...monthlyMap.entries()]
      .map(([month, value]) => ({
        month,
        label: `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`,
        requests: value.requests,
        failures: value.errors.failures,
        rateLimited: value.errors.rateLimited,
        clientErrors: value.errors.clientErrors,
        serverErrors: value.errors.serverErrors,
      }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    trends,
  };
});

type SupabaseUsageDataOptions = {
  environment?: ConsoleEnvironment;
  projectMetrics?: SupabaseProjectMetrics;
  storageUsedBytes?: number | null;
};

export const getSupabaseUsageData = cache(async (
  options: SupabaseUsageDataOptions = {},
): Promise<SupabaseUsageData> => {
  const [client, projectMetrics] = await Promise.all([
    getAdminReadClient(options.environment),
    options.projectMetrics
      ? Promise.resolve(options.projectMetrics)
      : getSupabaseProjectMetrics(options.environment),
  ]);
  if (!client) return {
    connected: false,
    error: "Supabase 환경 변수가 설정되지 않았습니다.",
    rowCounts: COUNT_TABLES.map(([table, label]) => ({ label, value: null, source: table })),
    metricsConfigured: projectMetrics.configured,
    metricsCheckedAt: projectMetrics.checkedAt,
    infrastructure: infrastructureMetrics(projectMetrics, options.storageUsedBytes ?? null),
  };

  const rpcResult = await client.rpc("get_admin_table_counts");
  if (!rpcResult.error) {
    const countRows = (rpcResult.data ?? []) as Array<{ table_name: string; row_count: number | string }>;
    const countMap = new Map<string, number>(countRows.map((row) => [String(row.table_name), Number(row.row_count)]));
    return {
      connected: true,
      error: null,
      rowCounts: COUNT_TABLES.map(([table, label]) => ({ label, value: countMap.get(table) ?? null, source: table })),
      metricsConfigured: projectMetrics.configured,
      metricsCheckedAt: projectMetrics.checkedAt,
      infrastructure: infrastructureMetrics(projectMetrics, options.storageUsedBytes ?? null),
    };
  }

  const fallback = await Promise.all(COUNT_TABLES.map(async ([table, label]) => {
    const result = await client.from(table).select("*", { count: "exact", head: true });
    return { label, value: result.error ? null : result.count ?? 0, source: table };
  }));
  return {
    connected: fallback.some((item) => item.value !== null),
    error: "보호된 테이블의 정확한 Row 수는 관리자 집계 RPC 적용 후 표시됩니다.",
    rowCounts: fallback,
    metricsConfigured: projectMetrics.configured,
    metricsCheckedAt: projectMetrics.checkedAt,
    infrastructure: infrastructureMetrics(projectMetrics, options.storageUsedBytes ?? null),
  };
});

function infrastructureMetrics(
  metrics: SupabaseProjectMetrics,
  storageUsedBytes: number | null = null,
): SupabaseUsageData["infrastructure"] {
  const metricStatus = (value: number | null) => value !== null ? "available" as const : metrics.configured ? "error" as const : "unavailable" as const;
  const unavailableDetail = metrics.detailsError ?? metrics.error ?? "해당 지표를 확인할 수 없습니다.";
  const connectionsDetail = metrics.databaseConnections === null
    ? unavailableDetail
    : metrics.databaseMaxConnections === null
      ? "현재 활성 연결 수"
      : `현재 활성 연결 수 · 최대 ${Math.round(metrics.databaseMaxConnections).toLocaleString("ko-KR")}개`;

  return [
    {
      key: "database-size", label: "DB 용량", value: metrics.databaseSizeBytes, unit: "bytes" as const,
      detail: metrics.databaseSizeBytes === null ? unavailableDetail : "postgres 데이터베이스 사용 공간",
      source: metrics.databaseSizeSource === "database-rpc"
        ? "Database RPC · pg_database_size"
        : "Supabase Metrics API · pg_database_size_bytes",
      status: metricStatus(metrics.databaseSizeBytes),
    },
    {
      key: "storage-size", label: "Storage 용량", value: storageUsedBytes, unit: "bytes" as const,
      detail: storageUsedBytes === null
        ? "Storage 집계 RPC를 확인할 수 없습니다."
        : "storage.objects metadata.size 합계",
      source: storageUsedBytes === null ? "미연동" : "Database RPC · admin_get_usage_snapshot",
      status: storageUsedBytes === null ? "unavailable" as const : "available" as const,
    },
    {
      key: "bandwidth", label: "Bandwidth", value: null, unit: "bytes" as const,
      detail: "프로젝트 과금 사용량을 조회할 Management API 계약이 필요합니다.",
      source: "미연동", status: "unavailable" as const,
    },
    {
      key: "edge-functions", label: "Edge Function 호출량", value: null, unit: "count" as const,
      detail: "기간별 함수 호출량을 조회할 Management API 계약이 필요합니다.",
      source: "미연동", status: "unavailable" as const,
    },
    {
      key: "database-connections", label: "DB Connection", value: metrics.databaseConnections, unit: "count" as const,
      detail: connectionsDetail,
      source: "Supabase Metrics API · connection_stats_connection_count", status: metricStatus(metrics.databaseConnections),
    },
    {
      key: "realtime-connections", label: "Realtime Connection", value: null, unit: "count" as const,
      detail: "현재 Metrics API의 안정된 Realtime 연결 지표 계약을 확인할 수 없습니다.",
      source: "미연동", status: "unavailable" as const,
    },
  ];
}

export const getSystemStatusData = cache(async (): Promise<SystemComponentStatus[]> => {
  const checkedAt = new Date().toISOString();
  const kickonApi = getKickonApiHealth(new Date(checkedAt));
  const connection = getSupabaseConnection();
  const clientPromise = getAdminReadClient();
  const databasePromise = clientPromise.then(async (client) => {
    if (!client) return { configured: false, error: true, latencyMs: null };
    const startedAt = performance.now();
    const result = await client.from("teams").select("id", { count: "exact", head: true });
    return { configured: true, error: Boolean(result.error), latencyMs: Math.round(performance.now() - startedAt) };
  });
  const [cron, provider, services, databaseResult, push] = await Promise.all([
    getCronData(),
    getProviderUsageData(),
    getSupabaseServiceHealth(),
    databasePromise,
    getPushDeliveryData(),
  ]);
  const databaseOk = databaseResult.configured && !databaseResult.error;
  const cronHealth = assessCronSystemHealth(cron.runtimeConnected, cron.jobs);
  const providerHealth = assessProviderHealth({
    connected: provider.connected,
    observedThrough: provider.observedThrough,
    latestStatusCode: provider.latestStatusCode,
    hourly: provider.trends["24h"],
  });
  const pushHealth = assessPushDeliveryHealth({
    connected: push.connected,
    latestStatus: push.latestStatus,
    latestCompletedAt: push.latestCompletedAt,
    runs24h: push.runs24h,
    delivered24h: push.delivered24h,
    failed24h: push.failed24h,
    removedTokens24h: push.removedTokens24h,
  }, new Date(checkedAt));

  return [
    { key: "kickon-api", label: "킥온 API", status: kickonApi.status, detail: kickonApi.detail, checkedAt: kickonApi.checkedAt, source: kickonApi.source, latencyMs: kickonApi.latencyMs },
    { key: "supabase-db", label: "Supabase DB", status: databaseResult.configured ? databaseOk ? "normal" : "danger" : "unknown", detail: databaseResult.configured ? databaseOk ? "실제 teams 쿼리 응답 정상" : "DB 쿼리 응답 실패" : "Supabase 연결 환경 변수가 설정되지 않았습니다.", checkedAt, source: "Supabase Query · teams HEAD", latencyMs: databaseResult.latencyMs },
    { key: "supabase-auth", label: "Supabase Auth", ...services.auth },
    { key: "supabase-storage", label: "Supabase Storage", ...services.storage },
    { key: "sportsmonks", label: "SportsMonks API", status: providerHealth.status, detail: providerHealthDetail(provider, providerHealth), checkedAt, source: provider.latestEndpoint ? `football_provider_usage · ${provider.latestEndpoint}` : "football_provider_usage", latencyMs: null },
    { key: "production-cron", label: "운영 Cron", status: connection.environment === "production" ? cronHealth.status : "unknown", detail: connection.environment === "production" ? cron.error ?? cronHealth.detail : "운영 Supabase 연결이 설정되지 않았습니다.", checkedAt, source: "pg_cron", latencyMs: null },
    { key: "development-cron", label: "개발 Cron", status: connection.environment === "development" ? cronHealth.status : "unknown", detail: connection.environment === "development" ? cron.error ?? cronHealth.detail : "개발 Supabase 연결이 설정되지 않았습니다.", checkedAt, source: "pg_cron", latencyMs: null },
    { key: "push", label: "Push Notification", status: pushHealth.status, detail: pushHealthDetail(push, pushHealth), checkedAt, source: "push_delivery_runs", latencyMs: null },
  ];
});

function providerHealthDetail(provider: ProviderUsageData, health: ProviderHealthAssessment) {
  if (health.reason === "unavailable") return provider.error ?? "서버 전용 사용 기록을 조회할 수 없습니다.";
  if (health.reason === "no-observation") return "최근 60일 SportsMonks 호출 기록이 없습니다.";
  const observed = formatKoreaDateTime(provider.observedThrough);
  if (health.reason === "stale") return `마지막 호출 ${observed} · 48시간 넘게 새 호출이 없습니다.`;
  if (health.reason === "aging") return `마지막 호출 ${observed} · 24시간 넘게 새 호출이 없습니다.`;
  if (health.reason === "latest-failure") return `마지막 호출 ${observed} · HTTP ${provider.latestStatusCode ?? "확인 불가"}`;
  if (health.reason === "high-failure-rate") return `최근 24시간 ${health.requests24h}회 중 ${health.failures24h}회 실패`;
  if (health.reason === "some-failures") return `최근 24시간 ${health.requests24h}회 중 ${health.failures24h}회 실패`;
  return `마지막 호출 ${observed} · 최근 24시간 ${health.requests24h}회 정상 관측`;
}

function pushHealthDetail(push: PushDeliveryData, health: PushDeliveryHealthAssessment) {
  if (health.reason === "unavailable") return push.error ?? "Push 전달 결과를 조회할 수 없습니다.";
  if (health.reason === "no-observation") return "최근 30일 Push 전달 실행 기록이 없습니다.";
  const completed = formatKoreaDateTime(push.latestCompletedAt);
  if (health.reason === "latest-failure") return `마지막 실행 ${completed} · ${push.latestErrorCode ?? "전체 전달 실패"}`;
  if (health.reason === "stale") return `마지막 실행 ${completed} · 7일 넘게 새 전달 관측이 없습니다.`;
  if (health.reason === "high-failure-rate") return `최근 24시간 ${health.attempts24h}회 중 ${push.failed24h}회 실패`;
  if (health.reason === "some-failures") return `최근 24시간 ${push.delivered24h}회 성공 · ${push.failed24h}회 실패`;
  if (push.runs24h === 0) return `마지막 실행 ${completed} · 최근 24시간 실행 없음`;
  if (health.attempts24h === 0) return `최근 24시간 ${push.runs24h}회 실행 · 등록된 대상 토큰 없음`;
  return `최근 24시간 ${push.delivered24h}회 전달 성공 · 만료 토큰 ${push.removedTokens24h}개 정리`;
}

export const getOperationalDashboardSnapshot = cache(async (): Promise<OperationalDashboardSnapshot> => {
  const [client, projectMetrics] = await Promise.all([getAdminReadClient(), getSupabaseProjectMetrics()]);
  if (!client) return {
    registeredUsers: null, errorEvents24h: null, openReports: null, providerRemaining: null, providerObservedAt: null, latestSyncAt: null, failedSyncCount: null,
    databaseSizeBytes: projectMetrics.databaseSizeBytes, supabaseMetricsConfigured: projectMetrics.configured,
  };

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [counts, profiles, errors, reports, sync, provider] = await Promise.all([
    client.rpc("get_admin_table_counts"),
    client.from("profiles").select("*", { count: "exact", head: true }),
    client.from("error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since),
    client.from("user_data_reports").select("id", { count: "exact", head: true }).in("status", ["open", "in_review"]),
    client.from("football_sync_state").select("last_succeeded_at,last_error").order("last_attempted_at", { ascending: false }).limit(50),
    getProviderUsageData(),
  ]);
  const countRows = counts.error ? [] : (counts.data ?? []) as Array<{ table_name: string; row_count: number | string }>;
  const profileCount = countRows.find((row) => row.table_name === "profiles");
  const syncRows = (sync.data ?? []) as Array<{ last_succeeded_at: string | null; last_error: string | null }>;
  return {
    registeredUsers: profileCount ? Number(profileCount.row_count) : profiles.error ? null : profiles.count ?? 0,
    errorEvents24h: errors.error ? null : errors.count ?? 0,
    openReports: reports.error ? null : reports.count ?? 0,
    providerRemaining: provider.remaining,
    providerObservedAt: provider.observedThrough,
    latestSyncAt: sync.error ? null : syncRows.find((row) => row.last_succeeded_at)?.last_succeeded_at ?? null,
    failedSyncCount: sync.error ? null : syncRows.filter((row) => row.last_error).length,
    databaseSizeBytes: projectMetrics.databaseSizeBytes,
    supabaseMetricsConfigured: projectMetrics.configured,
  };
});

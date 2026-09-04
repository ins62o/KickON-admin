"use client";

import type { SupabaseUsageSnapshot } from "@/components/dashboard/supabase-usage-card";
import type { UsageGaugePanelProps } from "@/components/dashboard/usage-gauge-card";
import { formatDecimalBytes, formatNumber } from "@/lib/format";
import { getSupabaseProjectMetrics } from "@/lib/supabase/project-metrics";
import { getSupabaseStorageUsage } from "@/lib/supabase/storage-usage";
import { getProviderUsageData, getSupabaseUsageData, getSystemStatusData } from "./platform-operations";
import { getOperationsClient } from "./operations-client";
import type { HealthStatus } from "./types";
import { getActiveConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function percentage(value: number | null, maximum: number | null) {
  if (value === null || maximum === null || maximum <= 0) return null;
  return Math.min(100, Math.max(0, (value / maximum) * 100));
}

function usageHealth(rate: number | null, available: boolean): HealthStatus {
  if (!available || rate === null) return "unknown";
  if (rate >= 95) return "danger";
  if (rate >= 70) return "warning";
  return "normal";
}

function storageAlertLevel(rate: number | null) {
  if (rate === null) return "한도 미설정" as const;
  if (rate >= 95) return "위험" as const;
  if (rate >= 85) return "경고" as const;
  if (rate >= 70) return "주의" as const;
  return "정상" as const;
}

type CoreUsageSources = {
  supabase: Awaited<ReturnType<typeof getSupabaseProjectMetrics>>;
  storage: Awaited<ReturnType<typeof getSupabaseStorageUsage>>;
  sportsMonks: Awaited<ReturnType<typeof getProviderUsageData>>;
};

type DirectUsageSnapshot = {
  databaseSizeBytes: number | null;
  storageUsedBytes: number | null;
  storageBucketCount: number | null;
  storageObjectCount: number | null;
  storageUnmeasuredObjectCount: number | null;
  storageCurrentMonthObjectCount: number | null;
  storageCurrentMonthUsedBytes: number | null;
  checkedAt: string | null;
  error: string | null;
};

function skippedProjectMetrics(): CoreUsageSources["supabase"] {
  return {
    configured: false,
    checkedAt: null,
    databaseSizeBytes: null,
    databaseConnections: null,
    databaseMaxConnections: null,
    databaseLimitBytes: null,
    providerAllowance: null,
    databaseSizeSource: null,
    detailsError: null,
    error: null,
  };
}

function skippedStorageDetails(): CoreUsageSources["storage"] {
  return {
    configured: false,
    checkedAt: null,
    usedBytes: null,
    bucketCount: null,
    objectCount: null,
    unmeasuredObjectCount: null,
    currentMonthObjectCount: null,
    currentMonthUsedBytes: null,
    storageLimitBytes: null,
    buckets: [],
    largestObjects: [],
    detailsError: null,
    error: null,
  };
}

function nonNegativeSafeInteger(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function hasCompleteDirectStorageUsage(snapshot: DirectUsageSnapshot) {
  return snapshot.storageUsedBytes !== null
    && snapshot.storageBucketCount !== null
    && snapshot.storageObjectCount !== null
    && snapshot.storageUnmeasuredObjectCount !== null;
}

async function getDirectUsageSnapshot(
  environment: ConsoleEnvironment,
): Promise<DirectUsageSnapshot> {
  const unavailable = (error: string): DirectUsageSnapshot => ({
    databaseSizeBytes: null,
    storageUsedBytes: null,
    storageBucketCount: null,
    storageObjectCount: null,
    storageUnmeasuredObjectCount: null,
    storageCurrentMonthObjectCount: null,
    storageCurrentMonthUsedBytes: null,
    checkedAt: null,
    error,
  });

  try {
    const client = await getOperationsClient(environment);
    if (!client) return unavailable("Supabase 연결 설정을 확인해 주세요.");

    const result = await client.rpc("admin_get_usage_snapshot");
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (result.error || !row || typeof row !== "object") {
      const missing = result.error?.code === "PGRST202" || result.error?.code === "42883";
      return unavailable(missing
        ? "admin_get_usage_snapshot 마이그레이션을 이 Supabase 프로젝트에 적용해 주세요."
        : "현재 로그인에는 사용량 집계 권한이 없거나 집계 RPC를 실행할 수 없습니다.");
    }

    const snapshot = row as Record<string, unknown>;
    return {
      databaseSizeBytes: nonNegativeSafeInteger(snapshot.database_size_bytes),
      storageUsedBytes: nonNegativeSafeInteger(snapshot.storage_used_bytes),
      storageBucketCount: nonNegativeSafeInteger(snapshot.storage_bucket_count),
      storageObjectCount: nonNegativeSafeInteger(snapshot.storage_object_count),
      storageUnmeasuredObjectCount: nonNegativeSafeInteger(snapshot.storage_unmeasured_object_count),
      storageCurrentMonthObjectCount: nonNegativeSafeInteger(snapshot.storage_current_month_object_count),
      storageCurrentMonthUsedBytes: nonNegativeSafeInteger(snapshot.storage_current_month_used_bytes),
      checkedAt: new Date().toISOString(),
      error: null,
    };
  } catch {
    // The metrics card must never make the dashboard fail when the optional
    // aggregate RPC is temporarily unavailable.
    return unavailable("사용량 집계 RPC 요청에 실패했습니다.");
  }
}

async function getCoreUsageSources(
  environment: ConsoleEnvironment = getActiveConsoleEnvironment(),
  includeSupplementaryDetails = true,
): Promise<CoreUsageSources> {
  const directSnapshotPromise = getDirectUsageSnapshot(environment);
  const supabasePromise = includeSupplementaryDetails
    ? getSupabaseProjectMetrics(environment)
    : directSnapshotPromise.then((snapshot) => snapshot.databaseSizeBytes === null
      ? getSupabaseProjectMetrics(environment)
      : skippedProjectMetrics());
  const storagePromise = includeSupplementaryDetails
    ? getSupabaseStorageUsage(environment)
    : directSnapshotPromise.then((snapshot) => hasCompleteDirectStorageUsage(snapshot)
      ? skippedStorageDetails()
      : getSupabaseStorageUsage(environment));
  const [supabase, storage, sportsMonks, directSnapshot] = await Promise.all([
    supabasePromise,
    storagePromise,
    getProviderUsageData(environment),
    directSnapshotPromise,
  ]);

  const hasDirectDatabaseUsage = directSnapshot.databaseSizeBytes !== null;
  const hasDirectStorageUsage = hasCompleteDirectStorageUsage(directSnapshot);

  return {
    supabase: hasDirectDatabaseUsage
      ? {
          ...supabase,
          configured: true,
          checkedAt: directSnapshot.checkedAt,
          databaseSizeBytes: directSnapshot.databaseSizeBytes,
          databaseSizeSource: "database-rpc" as const,
          detailsError: supabase.error,
          error: null,
        }
      : supabase.databaseSizeBytes !== null
        ? supabase
        : { ...supabase, error: directSnapshot.error ?? supabase.error },
    storage: hasDirectStorageUsage
      ? {
          ...storage,
          configured: true,
          checkedAt: directSnapshot.checkedAt,
          usedBytes: directSnapshot.storageUsedBytes,
          bucketCount: directSnapshot.storageBucketCount,
          objectCount: directSnapshot.storageObjectCount,
          unmeasuredObjectCount: directSnapshot.storageUnmeasuredObjectCount,
          currentMonthObjectCount: directSnapshot.storageCurrentMonthObjectCount
            ?? storage.currentMonthObjectCount,
          currentMonthUsedBytes: directSnapshot.storageCurrentMonthUsedBytes
            ?? storage.currentMonthUsedBytes,
          detailsError: storage.error,
          error: null,
        }
      : storage.usedBytes !== null
        ? storage
        : { ...storage, error: directSnapshot.error ?? storage.error },
    sportsMonks,
  };
}

function buildUsageCards({ supabase, storage, sportsMonks }: CoreUsageSources) {
  const databaseLimitGb = positiveNumber(process.env.NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB);
  const databaseLimitBytes = supabase.databaseLimitBytes ?? (databaseLimitGb === null ? null : databaseLimitGb * 1_000 ** 3);
  const databaseRate = percentage(supabase.databaseSizeBytes, databaseLimitBytes);
  const storageLimitGb = positiveNumber(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB);
  const storageLimitBytes = storage.storageLimitBytes ?? (storageLimitGb === null ? null : storageLimitGb * 1_000 ** 3);
  const storageRate = percentage(storage.usedBytes, storageLimitBytes);
  const providerAllowance = supabase.providerAllowance ?? positiveNumber(process.env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE);
  const providerUsed = sportsMonks.remaining !== null && providerAllowance !== null
    ? Math.max(0, providerAllowance - sportsMonks.remaining)
    : null;
  const providerRate = percentage(providerUsed, providerAllowance);

  const database: SupabaseUsageSnapshot = {
    title: "데이터베이스 사용량",
    description: "선수와 경기 같은 테이블과 인덱스가 사용하는 PostgreSQL 공간입니다.",
    limitLabel: databaseLimitBytes === null ? "한도 미설정" : formatDecimalBytes(databaseLimitBytes),
    rate: databaseRate,
    status: usageHealth(databaseRate, supabase.databaseSizeBytes !== null),
    centerValue: supabase.databaseSizeBytes === null ? "-" : formatDecimalBytes(supabase.databaseSizeBytes),
    centerLabel: "현재 DB 사용량",
    details: [
      { label: "현재 사용", value: supabase.databaseSizeBytes === null ? "확인 필요" : formatDecimalBytes(supabase.databaseSizeBytes) },
      { label: "전체 한도", value: databaseLimitBytes === null ? "설정 필요" : formatDecimalBytes(databaseLimitBytes) },
      { label: "남은 공간", value: supabase.databaseSizeBytes === null || databaseLimitBytes === null ? "계산 필요" : formatDecimalBytes(Math.max(0, databaseLimitBytes - supabase.databaseSizeBytes)) },
    ],
    updatedAt: supabase.checkedAt,
    message: supabase.error ?? (databaseLimitBytes === null
      ? "SUPABASE_DATABASE_LIMIT_GB를 설정하면 사용률을 계산할 수 있습니다."
      : "현재 프로젝트의 PostgreSQL 데이터베이스 전체 사용량입니다."),
  };

  const fileStorage: SupabaseUsageSnapshot = {
    title: "파일 스토리지 사용량",
    description: "Supabase Storage 버킷에 실제 업로드한 사진·영상·파일 공간입니다.",
    limitLabel: storageLimitBytes === null ? "한도 미설정" : formatDecimalBytes(storageLimitBytes),
    rate: storageRate,
    status: usageHealth(storageRate, storage.usedBytes !== null),
    centerValue: storage.usedBytes === null ? "-" : formatDecimalBytes(storage.usedBytes),
    centerLabel: "현재 파일 사용량",
    details: [
      { label: "현재 사용", value: storage.usedBytes === null ? "확인 필요" : formatDecimalBytes(storage.usedBytes) },
      { label: "전체 한도", value: storageLimitBytes === null ? "설정 필요" : formatDecimalBytes(storageLimitBytes) },
      { label: "파일 수", value: storage.objectCount === null ? "확인 필요" : `${formatNumber(storage.objectCount)}개` },
    ],
    updatedAt: storage.checkedAt,
    message: storage.error ?? (storageLimitBytes === null
      ? "SUPABASE_STORAGE_LIMIT_GB를 설정하면 사용률을 계산할 수 있습니다."
      : `버킷 ${formatNumber(storage.bucketCount)}개의 실제 파일을 합산했습니다.`),
  };

  const provider: UsageGaugePanelProps = {
    title: "SportsMonks API 사용량",
    rate: providerRate,
    status: usageHealth(providerRate, sportsMonks.connected && sportsMonks.remaining !== null),
    centerValue: sportsMonks.remaining === null ? "-" : `${formatNumber(sportsMonks.remaining)}회`,
    centerLabel: "남은 호출",
    details: [
      { label: "오늘 호출", value: sportsMonks.todayCount === null ? "확인 필요" : `${formatNumber(sportsMonks.todayCount)}회` },
      { label: "이번 달 호출", value: sportsMonks.monthCount === null ? "확인 필요" : `${formatNumber(sportsMonks.monthCount)}회` },
      { label: "60일 오류", value: sportsMonks.failedCount === null ? "확인 필요" : `${formatNumber(sportsMonks.failedCount)}회` },
    ],
    updatedAt: sportsMonks.observedThrough,
    message: sportsMonks.error ?? (sportsMonks.recordCount === 0
      ? "최근 60일 동안 수집된 SportsMonks 호출 기록이 없습니다."
      : providerAllowance === null
        ? "SPORTSMONKS_API_ALLOWANCE를 설정하면 사용률을 계산할 수 있습니다."
        : "최근 60일 SportsMonks 응답 헤더와 호출 기록을 기준으로 집계했습니다."),
  };

  const checkedAt = [supabase.checkedAt, storage.checkedAt, sportsMonks.observedThrough]
    .filter((value): value is string => Boolean(value))
    .reduce<string | null>((latest, value) => !latest || new Date(value) > new Date(latest) ? value : latest, null);

  const storageInsights = {
    rate: storageRate,
    alertLevel: storageAlertLevel(storageRate),
    currentMonthObjectCount: storage.currentMonthObjectCount,
    currentMonthUsedBytes: storage.currentMonthUsedBytes,
    unmeasuredObjectCount: storage.unmeasuredObjectCount,
    largestObjects: storage.largestObjects,
    configured: storage.configured,
    error: storage.detailsError ?? storage.error,
  };

  return { database, fileStorage, provider, checkedAt, storageInsights };
}

export async function getDashboardUsageSnapshots() {
  const environment = getActiveConsoleEnvironment();
  const sources = await getCoreUsageSources(environment, false);
  const { database, fileStorage, provider } = buildUsageCards(sources);

  return {
    database,
    fileStorage,
    provider,
    sportsMonks: sources.sportsMonks.allowance === null && sources.supabase.providerAllowance !== null
      ? { ...sources.sportsMonks, allowance: sources.supabase.providerAllowance }
      : sources.sportsMonks,
  };
}

export async function getUsageSnapshots() {
  const environment = getActiveConsoleEnvironment();
  const coreUsagePromise = getCoreUsageSources(environment);
  const supabaseDetailsPromise = coreUsagePromise.then((coreUsage) => getSupabaseUsageData({
    environment,
    projectMetrics: coreUsage.supabase,
    storageUsedBytes: coreUsage.storage.usedBytes,
  }));
  const storageBucketsPromise = getOperationsClient(environment).then(async (client) => {
    if (!client) return { rows: [] as StorageBucketUsage[], error: "Supabase 연결이 없습니다." };
    const result = await client.rpc("admin_get_storage_usage");
    if (result.error) return { rows: [] as StorageBucketUsage[], error: "버킷별 Storage 집계를 확인하려면 관리자 마이그레이션이 필요합니다." };
    return {
      rows: ((result.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        bucketId: String(row.bucket_id),
        objectCount: Number(row.object_count ?? 0),
        usedBytes: Number(row.used_bytes ?? 0),
        unmeasuredObjectCount: Number(row.unmeasured_object_count ?? 0),
        oldestObjectAt: row.oldest_object_at == null ? null : String(row.oldest_object_at),
        newestObjectAt: row.newest_object_at == null ? null : String(row.newest_object_at),
      })),
      error: null,
    };
  });
  const [coreUsage, supabaseDetails, systems, storageBuckets] = await Promise.all([
    coreUsagePromise,
    supabaseDetailsPromise,
    getSystemStatusData(),
    storageBucketsPromise,
  ]);
  const { database, fileStorage, provider, checkedAt, storageInsights } = buildUsageCards(coreUsage);

  return {
    database,
    fileStorage,
    provider,
    sportsMonks: coreUsage.sportsMonks.allowance === null && coreUsage.supabase.providerAllowance !== null
      ? { ...coreUsage.sportsMonks, allowance: coreUsage.supabase.providerAllowance }
      : coreUsage.sportsMonks,
    supabaseDetails,
    systems,
    storageBuckets,
    storageInsights,
    checkedAt,
  };
}

export type StorageBucketUsage = {
  bucketId: string;
  objectCount: number;
  usedBytes: number;
  unmeasuredObjectCount: number;
  oldestObjectAt: string | null;
  newestObjectAt: string | null;
};

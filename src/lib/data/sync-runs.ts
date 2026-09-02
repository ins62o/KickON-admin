import "server-only";

import { cache } from "react";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type SyncRunItemRecord = {
  id: number;
  entityType: string;
  entityId: string | null;
  operation: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: string;
};

export type SyncRunRecord = {
  id: string;
  jobKey: string;
  targetType: string | null;
  targetId: string | null;
  triggerType: string;
  environment: string;
  status: string;
  requestedBy: string | null;
  reason: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  insertedCount: number | null;
  updatedCount: number | null;
  skippedCount: number | null;
  deletedCount: number | null;
  failedCount: number | null;
  providerRequestCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: string;
};

export type SyncRunListRecord = Omit<SyncRunRecord, "requestedBy" | "errorCode">;

export type SyncRunListData = {
  runs: SyncRunListRecord[];
  total: number | null;
  schemaReady: boolean;
  error: string | null;
};

const sensitiveKey = /token|secret|password|authorization|cookie|session|credential|refresh|access[_-]?key/i;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function safeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED_DEPTH]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.replace(bearerPattern, "[REDACTED_BEARER]").replace(jwtPattern, "[REDACTED_JWT]").slice(0, 4000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeMetadata(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [key.slice(0, 120), sensitiveKey.test(key) ? "[REDACTED]" : safeMetadata(item, depth + 1)]));
  return String(value).slice(0, 1000);
}

export const getSyncRunList = cache(async (): Promise<SyncRunListData> => {
  const client = await getOperationsClient();
  if (!client) return { runs: [], total: null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };

  const result = await client
    .from("sync_runs")
    .select("id,job_key,target_type,target_id,trigger_type,environment,status,reason,started_at,finished_at,inserted_count,updated_count,skipped_count,failed_count,provider_request_count,error_message,metadata,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, 199);

  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return {
      runs: [],
      total: null,
      schemaReady: !missing,
      error: missing ? "운영 스키마 마이그레이션과 동기화 기록 연동이 필요합니다." : "동기화 기록을 조회할 수 없습니다.",
    };
  }

  return {
    runs: (result.data ?? []).map((row) => {
      const metadata = safeMetadata(row.metadata);
      return {
        id: String(row.id),
        jobKey: row.job_key,
        targetType: row.target_type,
        targetId: row.target_id,
        triggerType: row.trigger_type,
        environment: row.environment,
        status: row.status,
        reason: row.reason,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        insertedCount: row.inserted_count,
        updatedCount: row.updated_count,
        skippedCount: row.skipped_count,
        deletedCount: deletedCountFromMetadata(metadata),
        failedCount: row.failed_count,
        providerRequestCount: row.provider_request_count,
        errorMessage: row.error_message,
        metadata,
        createdAt: row.created_at,
      };
    }),
    total: result.count,
    schemaReady: true,
    error: null,
  };
});

export const getSyncRunDetail = cache(async (runId: string) => {
  const client = await getOperationsClient();
  if (!client) return { run: null as SyncRunRecord | null, items: [] as SyncRunItemRecord[], schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const [runResult, itemResult] = await Promise.all([
    client.from("sync_runs").select("id,job_key,target_type,target_id,trigger_type,environment,status,requested_by,reason,started_at,finished_at,inserted_count,updated_count,skipped_count,failed_count,provider_request_count,error_code,error_message,metadata,created_at").eq("id", runId).maybeSingle(),
    client.from("sync_run_items").select("id,entity_type,entity_id,operation,status,error_code,error_message,metadata,created_at").eq("run_id", runId).order("id").range(0, 499),
  ]);
  const error = runResult.error ?? itemResult.error;
  if (error) {
    const missing = isOperationsSchemaMissing(error.code);
    return { run: null as SyncRunRecord | null, items: [] as SyncRunItemRecord[], schemaReady: !missing, error: missing ? "운영 스키마 마이그레이션 적용이 필요합니다." : "동기화 실행 상세를 조회할 수 없습니다." };
  }
  const row = runResult.data;
  if (!row) return { run: null as SyncRunRecord | null, items: [] as SyncRunItemRecord[], schemaReady: true, error: null };
  const sanitizedMetadata = safeMetadata(row.metadata);
  return {
    run: {
      id: String(row.id), jobKey: row.job_key, targetType: row.target_type, targetId: row.target_id,
      triggerType: row.trigger_type, environment: row.environment, status: row.status, requestedBy: row.requested_by,
      reason: row.reason, startedAt: row.started_at, finishedAt: row.finished_at,
      insertedCount: row.inserted_count, updatedCount: row.updated_count, skippedCount: row.skipped_count,
      deletedCount: deletedCountFromMetadata(sanitizedMetadata),
      failedCount: row.failed_count, providerRequestCount: row.provider_request_count,
      errorCode: row.error_code, errorMessage: row.error_message, metadata: sanitizedMetadata, createdAt: row.created_at,
    },
    items: (itemResult.data ?? []).map((item) => ({
      id: Number(item.id), entityType: item.entity_type, entityId: item.entity_id, operation: item.operation,
      status: item.status, errorCode: item.error_code, errorMessage: item.error_message,
      metadata: safeMetadata(item.metadata), createdAt: item.created_at,
    })),
    schemaReady: true,
    error: null,
  };
});

function deletedCountFromMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const count = Number((value as Record<string, unknown>).deletedCount);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/auth/config";
import { createAuthServerClient, requireAdmin } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { ingestErrorEvent, sanitizeErrorText, type ErrorEventPayload } from "@/lib/errors/ingestion";
import { getSyncOperation } from "./catalog";

export type SyncActionState = {
  status: "idle" | "success" | "warning" | "error";
  message: string | null;
  operation: string | null;
  completedAt: string | null;
};

function safeResult(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !/token|secret|authorization|playerNames/i.test(key))
      .slice(0, 30),
  );
}

function resultMessage(operationLabel: string, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const status = typeof record.status === "string" ? record.status : "completed";
  if (status === "cached") return `${operationLabel}: 최근 데이터가 있어 캐시를 사용했습니다.`;
  if (status === "pending" || status === "already-running") return `${operationLabel}: 이미 실행 중이거나 쿨다운 대기 중입니다.`;
  return `${operationLabel} 동기화 요청이 완료되었습니다.`;
}

function resultMetrics(operationKey: string, payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  if (record.status === "cached" || record.status === "pending" || record.status === "already-running") {
    return { skipped_count: 1 };
  }
  if (operationKey === "team-metrics" && Number.isInteger(Number(record.updatedTeams))) {
    return { updated_count: Math.max(0, Number(record.updatedTeams)) };
  }
  return {};
}

function secretOperationBody(operationKey: string) {
  if (operationKey === "live") return { mode: "live", pollCount: 0 };
  if (operationKey === "post-match") return { leagueId: 1034, seasonId: 26894, season: 2026, postMatch: true, syncLineups: false, lineupFixtureLimit: 0 };
  if (operationKey === "history-backfill") return { mode: "backfill-history" };
  return { leagueId: 1034, seasonId: 26894, season: 2026, syncLineups: true };
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const context = record.context && typeof record.context === "object" ? record.context as Record<string, unknown> : null;
  for (const candidate of [record.status, record.statusCode, context?.status]) {
    const value = Number(candidate);
    if (Number.isInteger(value) && value >= 100 && value <= 599) return value;
  }
  return null;
}

function errorType(status: number | null, message: string) {
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) return "rate_limit";
  if (/timeout|timed out|abort/i.test(message)) return "api_timeout";
  if (status && status >= 500) return "provider_api_error";
  return "sync_failure";
}

type ProviderQuotaSnapshot = {
  remaining: number;
  resetAt: string | null;
  observedAt: string;
};

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getProviderQuotaSnapshot(
  supabase: NonNullable<Awaited<ReturnType<typeof createAuthServerClient>>>,
): Promise<ProviderQuotaSnapshot | null> {
  const result = await supabase.rpc("get_admin_provider_usage", {
    since_at: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
  });
  if (result.error || !Array.isArray(result.data)) return null;

  for (const value of result.data as Array<Record<string, unknown>>) {
    const remaining = Number(value.remaining);
    const observedAt = typeof value.observed_at === "string" ? value.observed_at : null;
    const observedAtMs = observedAt ? Date.parse(observedAt) : Number.NaN;
    if (!Number.isSafeInteger(remaining) || remaining < 0 || !Number.isFinite(observedAtMs)) continue;

    const resetsInSeconds = Number(value.resets_in_seconds);
    const resetAt = Number.isSafeInteger(resetsInSeconds) && resetsInSeconds >= 0
      ? new Date(observedAtMs + resetsInSeconds * 1_000).toISOString()
      : null;
    return { remaining, resetAt, observedAt: new Date(observedAtMs).toISOString() };
  }
  return null;
}

function scheduleOperationalError(payload: ErrorEventPayload, authenticatedUserId: string, requestId: string | null) {
  after(async () => { await ingestErrorEvent(payload, { authenticatedUserId, requestId }); });
}

async function updateRun(
  supabase: NonNullable<Awaited<ReturnType<typeof createAuthServerClient>>>,
  runId: string,
  input: Record<string, unknown>,
) {
  const result = await supabase.from("sync_runs").update(input).eq("id", runId);
  return result.error ? sanitizeErrorText(result.error.message) || "동기화 실행 기록 갱신 실패" : null;
}

async function validateSyncTarget(
  supabase: NonNullable<Awaited<ReturnType<typeof createAuthServerClient>>>,
  target: "none" | "team" | "fixture",
  targetId: string | null,
) {
  if (target === "none") return null;
  if (!targetId) return target === "team" ? "대상 구단을 선택해 주세요." : "대상 경기를 선택해 주세요.";
  if (target === "team") {
    const result = await supabase.from("teams").select("id").eq("id", targetId).maybeSingle();
    if (result.error) return "대상 구단을 확인할 수 없습니다.";
    return result.data ? null : "존재하지 않는 구단은 동기화할 수 없습니다.";
  }
  const result = await supabase.from("fixtures").select("id,league_id").eq("id", targetId).maybeSingle();
  if (result.error) return "대상 경기를 확인할 수 없습니다.";
  if (!result.data) return "존재하지 않는 경기는 동기화할 수 없습니다.";
  return result.data.league_id === "kleague" ? null : "현재 킥온 리그 범위의 경기만 동기화할 수 있습니다.";
}

export async function runSyncAction(_previous: SyncActionState, formData: FormData): Promise<SyncActionState> {
  const admin = await requireAdmin();
  const operationKey = String(formData.get("operation") ?? "");
  const operation = getSyncOperation(operationKey);
  const reason = String(formData.get("reason") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const fixtureId = String(formData.get("fixtureId") ?? "").trim();
  const confirmedLowQuota = formData.get("confirmLowQuota") === "yes";

  if (admin.isDevelopmentBypass || !admin.userId) {
    return { status: "error", message: "인증 우회 상태에서는 외부 동기화를 실행할 수 없습니다.", operation: operationKey, completedAt: null };
  }
  if (!hasAdminPermission(admin.role, "sync.run")) {
    return { status: "error", message: "동기화 실행 권한이 없습니다.", operation: operationKey, completedAt: null };
  }
  if (!operation) {
    return { status: "error", message: "지원하지 않는 동기화 작업입니다.", operation: operationKey, completedAt: null };
  }
  if (reason.length < 3 || reason.length > 500) {
    return { status: "error", message: "실행 이유를 3자 이상 500자 이하로 입력해 주세요.", operation: operation.key, completedAt: null };
  }
  if (operation.target === "team" && !teamId) {
    return { status: "error", message: "대상 구단을 선택해 주세요.", operation: operation.key, completedAt: null };
  }
  if (operation.target === "fixture" && !fixtureId) {
    return { status: "error", message: "대상 경기를 선택해 주세요.", operation: operation.key, completedAt: null };
  }

  const supabase = await createAuthServerClient();
  const publicConfig = getPublicSupabaseConfig();
  if (!supabase || !publicConfig) {
    return { status: "error", message: "Supabase 환경 변수가 설정되지 않았습니다.", operation: operation.key, completedAt: null };
  }

  const targetId = operation.target === "team" ? teamId : operation.target === "fixture" ? fixtureId : null;
  const targetError = await validateSyncTarget(supabase, operation.target, targetId);
  if (targetError) {
    return { status: "error", message: targetError, operation: operation.key, completedAt: null };
  }
  const providerQuota = await getProviderQuotaSnapshot(supabase);
  const providerAllowance = positiveNumber(process.env.SPORTSMONKS_API_ALLOWANCE);
  const lowQuotaThreshold = providerAllowance === null ? 200 : Math.max(1, Math.floor(providerAllowance * 0.15));
  const providerQuotaLow = providerQuota !== null && providerQuota.remaining <= lowQuotaThreshold;
  if (providerQuotaLow && !confirmedLowQuota) {
    return {
      status: "warning",
      message: `SportsMonks 잔여 할당량이 ${providerQuota.remaining}회입니다. 화면을 새로고침한 뒤 잔여량 부족 확인에 동의해 주세요.`,
      operation: operation.key,
      completedAt: null,
    };
  }
  const providerQuotaMetadata = providerQuota ? {
    remaining: providerQuota.remaining,
    resetAt: providerQuota.resetAt,
    observedAt: providerQuota.observedAt,
    allowance: providerAllowance,
    low: providerQuotaLow,
  } : null;
  const startedAt = new Date().toISOString();
  const { data: run, error: runInsertError } = await supabase
    .from("sync_runs")
    .insert({
      job_key: operation.functionName,
      target_type: operation.target === "none" ? null : operation.target,
      target_id: targetId,
      trigger_type: "manual",
      environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
      status: "running",
      requested_by: admin.userId,
      reason,
      started_at: startedAt,
      metadata: {
        operationKey: operation.key,
        providerQuota: providerQuotaMetadata,
      },
    })
    .select("id")
    .maybeSingle();
  const runId = run?.id ? String(run.id) : null;
  if (runInsertError || !runId) {
    const message = sanitizeErrorText(runInsertError?.message ?? "동기화 실행 기록 ID가 반환되지 않았습니다.") || "동기화 실행 기록을 생성하지 못했습니다.";
    scheduleOperationalError({
      source: "database", title: `${operation.label} 실행 기록 생성 실패`, errorType: "supabase_query_failure", severity: "warning",
      occurredAt: startedAt, environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
      route: "/sync", operation: "sync_runs.insert", message,
      context: { jobName: operation.functionName, operationKey: operation.key, targetType: operation.target, teamId: teamId || null, fixtureId: fixtureId || null, startedAt },
    }, admin.userId, null);
    return {
      status: "error",
      message: "실행 기록을 생성하지 못해 실제 동기화를 시작하지 않았습니다. 운영 스키마와 권한을 확인해 주세요.",
      operation: operation.key,
      completedAt: null,
    };
  }
  let snapshotState: "not-applicable" | "captured" | "unavailable" = "not-applicable";
  let candidateReconciliation: "not-applicable" | "completed" | "unavailable" = "not-applicable";
  let reconciledCandidateCount: number | null = null;

  try {
    if (operation.key === "team-squad") {
      const beforeSnapshot = await supabase.rpc("capture_player_squad_snapshot", {
        p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_source: "동기화 전", p_sync_run_id: runId,
      });
      snapshotState = beforeSnapshot.error ? "unavailable" : "captured";
    }

    let payload: unknown;
    if (operation.requiresSecret) {
      const syncSecret = process.env.FOOTBALL_SYNC_SECRET;
      if (!syncSecret) throw new Error("서버의 FOOTBALL_SYNC_SECRET 설정이 필요합니다.");
      const body = secretOperationBody(operation.key);
      const response = await fetch(`${publicConfig.url}/functions/v1/${operation.functionName}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sync-secret": syncSecret },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `HTTP ${response.status}`;
        throw new Error(detail);
      }
    } else {
      const body = operation.target === "team" ? { teamId }
        : operation.target === "fixture" ? { fixtureId }
          : {};
      const result = await supabase.functions.invoke(operation.functionName, { body });
      if (result.error) throw result.error;
      payload = result.data;
    }

    if (operation.key === "team-squad") {
      const afterSnapshot = await supabase.rpc("capture_player_squad_snapshot", {
        p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_source: "SportsMonks 동기화 후", p_sync_run_id: runId,
      });
      if (afterSnapshot.error) snapshotState = "unavailable";

      const reconciliation = await supabase.rpc("reconcile_provider_player_change_candidates", {
        p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_sync_run_id: runId,
      });
      const reconciledCount = Number(reconciliation.data);
      if (reconciliation.error || !Number.isInteger(reconciledCount) || reconciledCount < 0) {
        candidateReconciliation = "unavailable";
      } else {
        candidateReconciliation = "completed";
        reconciledCandidateCount = reconciledCount;
      }
    }

    const completedAt = new Date().toISOString();
    const resultRecord: Record<string, unknown> = {
      ...safeResult(payload),
      operationKey: operation.key,
      playerChangeSnapshot: snapshotState,
      playerChangeCandidateReconciliation: candidateReconciliation,
      reconciledPlayerChangeCandidates: reconciledCandidateCount,
      providerQuota: providerQuotaMetadata,
    };
    const remoteStatus = typeof resultRecord.status === "string" ? resultRecord.status : null;
    const finalizationError = await updateRun(supabase, runId, {
      status: remoteStatus === "pending" || remoteStatus === "already-running" ? "partial" : "succeeded",
      finished_at: completedAt,
      metadata: resultRecord,
      ...resultMetrics(operation.key, payload),
    });
    if (finalizationError) {
      scheduleOperationalError({
        source: "database", title: `${operation.label} 실행 기록 갱신 실패`, errorType: "supabase_query_failure", severity: "warning",
        occurredAt: completedAt, environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
        route: "/sync", operation: "sync_runs.update", message: finalizationError,
        context: { jobName: operation.functionName, operationKey: operation.key, targetType: operation.target, targetId, teamId: teamId || null, fixtureId: fixtureId || null, syncRunId: runId, startedAt, completedAt },
      }, admin.userId, runId);
    }
    revalidatePath("/");
    revalidatePath("/sync");
    revalidatePath("/squads");
    revalidatePath("/standings");
    revalidatePath("/usage");
    if (teamId) revalidatePath(`/squads?team=${encodeURIComponent(teamId)}`);
    return {
      status: finalizationError ? "warning" : "success",
      message: finalizationError
        ? `${resultMessage(operation.label, payload)} 단, 실행 기록 마무리에 실패했으므로 중복 실행하지 말고 기록을 확인해 주세요.`
        : resultMessage(operation.label, payload),
      operation: operation.key,
      completedAt,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const rawMessage = error instanceof Error ? error.message : "동기화 요청에 실패했습니다.";
    const message = sanitizeErrorText(rawMessage) || "동기화 요청에 실패했습니다.";
    const status = errorStatus(error);
    const failureType = errorType(status, message);
    const failureRecordError = await updateRun(supabase, runId, {
      status: "failed",
      finished_at: completedAt,
      failed_count: 1,
      error_code: failureType,
      error_message: message,
      metadata: {
        operationKey: operation.key,
        playerChangeSnapshot: snapshotState,
        playerChangeCandidateReconciliation: candidateReconciliation,
        reconciledPlayerChangeCandidates: reconciledCandidateCount,
        httpStatus: status,
        providerQuota: providerQuotaMetadata,
      },
    });
    scheduleOperationalError({
      source: "edge_function",
      title: `${operation.label} 동기화 실패`,
      errorType: failureType,
      severity: "error",
      occurredAt: completedAt,
      environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
      route: "/sync",
      apiEndpoint: `/functions/v1/${operation.functionName}`,
      httpStatus: status,
      operation: operation.functionName,
      message,
      stackTrace: error instanceof Error ? error.stack : null,
      context: {
        jobName: operation.functionName,
        operationKey: operation.key,
        targetType: operation.target,
        targetId,
        teamId: teamId || null,
        fixtureId: fixtureId || null,
        syncRunId: runId,
        startedAt,
        completedAt,
        durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
      },
    }, admin.userId, runId);
    revalidatePath("/");
    revalidatePath("/usage");
    revalidatePath("/audit");
    return {
      status: "error",
      message: failureRecordError ? `${message} 또한 실패 기록 저장에 실패했습니다.` : message,
      operation: operation.key,
      completedAt,
    };
  }
}

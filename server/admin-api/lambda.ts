import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasAdminPermission, isAdminRole, type AdminRole } from "../../src/lib/auth/permissions.ts";
import { getSyncOperation } from "../../src/lib/sync/catalog.ts";
import { getSupabaseProjectMetrics } from "./project-metrics.ts";
import { getSupabaseStorageUsage } from "./storage-usage.ts";

type LambdaEvent = {
  rawPath?: string;
  path?: string;
  httpMethod?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
  requestContext?: { http?: { method?: string } };
};

type LambdaResponse = { statusCode: number; headers: Record<string, string>; body: string };
type AdminContext = { client: SupabaseClient; userId: string; role: AdminRole };

function header(event: LambdaEvent, name: string) {
  const entry = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1]?.trim() ?? "";
}

function allowedOrigin(event: LambdaEvent) {
  const origin = header(event, "origin");
  if (!origin) return null;
  const allowed = (process.env.ADMIN_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : false;
}

function response(event: LambdaEvent, statusCode: number, body: unknown): LambdaResponse {
  const origin = allowedOrigin(event);
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      vary: "Origin, Authorization",
      ...(origin ? { "access-control-allow-origin": origin } : {}),
    },
    body: JSON.stringify(body),
  };
}

function method(event: LambdaEvent) {
  return event.requestContext?.http?.method ?? event.httpMethod ?? "GET";
}

function path(event: LambdaEvent) {
  return event.rawPath ?? event.path ?? "/";
}

function parseBody(event: LambdaEvent) {
  if (!event.body) return null;
  try {
    const value = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function authenticate(event: LambdaEvent): Promise<AdminContext | null> {
  const match = header(event, "authorization").match(/^Bearer\s+(.+)$/i);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!match || !url || !key) return null;

  const token = match[1];
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const userResult = await client.auth.getUser(token);
  if (userResult.error || !userResult.data.user) return null;
  const membership = await client.from("admin_users").select("role,is_active").eq("user_id", userResult.data.user.id).maybeSingle();
  if (membership.error || !membership.data?.is_active || !isAdminRole(membership.data.role)) return null;
  return { client, userId: userResult.data.user.id, role: membership.data.role };
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "관리자 API 요청에 실패했습니다.";
  return message.replace(/Bearer\s+\S+|token|secret|authorization/gi, "[REDACTED]").slice(0, 1_000);
}

function secretOperationBody(operationKey: string) {
  if (operationKey === "live") return { mode: "live", pollCount: 0 };
  if (operationKey === "post-match") return { leagueId: 1034, seasonId: 26894, season: 2026, postMatch: true, syncLineups: false, lineupFixtureLimit: 0 };
  if (operationKey === "history-backfill") return { mode: "backfill-history" };
  return { leagueId: 1034, seasonId: 26894, season: 2026, syncLineups: true };
}

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decimalGigabytesInBytes(value: string | undefined) {
  const gigabytes = positiveNumber(value);
  return gigabytes === null ? null : gigabytes * 1_000 ** 3;
}

async function providerQuota(client: SupabaseClient) {
  const result = await client.rpc("get_admin_provider_usage", {
    since_at: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
  });
  if (result.error || !Array.isArray(result.data)) return null;
  for (const value of result.data as Array<Record<string, unknown>>) {
    const remaining = Number(value.remaining);
    const observedAt = typeof value.observed_at === "string" ? value.observed_at : null;
    const observedAtMs = observedAt ? Date.parse(observedAt) : Number.NaN;
    if (!Number.isSafeInteger(remaining) || remaining < 0 || !Number.isFinite(observedAtMs)) continue;
    const resetsInSeconds = Number(value.resets_in_seconds);
    return {
      remaining,
      observedAt: new Date(observedAtMs).toISOString(),
      resetAt: Number.isSafeInteger(resetsInSeconds) && resetsInSeconds >= 0
        ? new Date(observedAtMs + resetsInSeconds * 1_000).toISOString()
        : null,
    };
  }
  return null;
}

async function validateTarget(client: SupabaseClient, target: "none" | "team" | "fixture", targetId: string | null) {
  if (target === "none") return null;
  if (!targetId) return target === "team" ? "대상 구단을 선택해 주세요." : "대상 경기를 선택해 주세요.";
  if (target === "team") {
    const result = await client.from("teams").select("id").eq("id", targetId).maybeSingle();
    return result.error ? "대상 구단을 확인할 수 없습니다." : result.data ? null : "존재하지 않는 구단입니다.";
  }
  const result = await client.from("fixtures").select("id,league_id").eq("id", targetId).maybeSingle();
  if (result.error) return "대상 경기를 확인할 수 없습니다.";
  if (!result.data) return "존재하지 않는 경기입니다.";
  return result.data.league_id === "kleague" ? null : "현재 킥온 리그 범위의 경기만 동기화할 수 있습니다.";
}

function safeResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/token|secret|authorization|playerNames/i.test(key)).slice(0, 30));
}

async function runSync(context: AdminContext, payload: Record<string, unknown>) {
  if (!hasAdminPermission(context.role, "sync.run")) throw new Error("동기화 실행 권한이 없습니다.");
  const operationKey = String(payload.operation ?? "");
  const operation = getSyncOperation(operationKey);
  const reason = String(payload.reason ?? "").trim();
  const teamId = String(payload.teamId ?? "").trim();
  const fixtureId = String(payload.fixtureId ?? "").trim();
  const confirmedLowQuota = payload.confirmLowQuota === "yes";
  if (!operation) throw new Error("지원하지 않는 동기화 작업입니다.");
  if (reason.length < 3 || reason.length > 500) throw new Error("실행 이유를 3자 이상 500자 이하로 입력해 주세요.");
  const targetId = operation.target === "team" ? teamId : operation.target === "fixture" ? fixtureId : null;
  const targetError = await validateTarget(context.client, operation.target, targetId);
  if (targetError) throw new Error(targetError);

  const quota = await providerQuota(context.client);
  const allowance = positiveNumber(process.env.SPORTSMONKS_API_ALLOWANCE);
  const lowQuotaThreshold = allowance === null ? 200 : Math.max(1, Math.floor(allowance * 0.15));
  if (quota && quota.remaining <= lowQuotaThreshold && !confirmedLowQuota) {
    return {
      status: "warning",
      message: `SportsMonks 잔여 할당량이 ${quota.remaining}회입니다. 잔여량 부족 확인에 동의한 뒤 다시 실행해 주세요.`,
      operation: operation.key,
      completedAt: null,
    };
  }
  const quotaMetadata = quota ? { ...quota, allowance, low: quota.remaining <= lowQuotaThreshold } : null;

  const startedAt = new Date().toISOString();
  const runResult = await context.client.from("sync_runs").insert({
    job_key: operation.functionName,
    target_type: operation.target === "none" ? null : operation.target,
    target_id: targetId,
    trigger_type: "manual",
    environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
    status: "running",
    requested_by: context.userId,
    reason,
    started_at: startedAt,
    metadata: { operationKey: operation.key, providerQuota: quotaMetadata },
  }).select("id").maybeSingle();
  const runId = runResult.data?.id ? String(runResult.data.id) : null;
  if (runResult.error || !runId) throw new Error("실행 기록을 만들지 못해 동기화를 시작하지 않았습니다.");

  try {
    if (operation.key === "team-squad") {
      await context.client.rpc("capture_player_squad_snapshot", { p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_source: "동기화 전", p_sync_run_id: runId });
    }

    let resultPayload: unknown;
    if (operation.requiresSecret) {
      const syncSecret = process.env.FOOTBALL_SYNC_SECRET?.trim();
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      if (!syncSecret || !projectUrl) throw new Error("관리자 API의 동기화 비밀값 설정이 필요합니다.");
      const result = await fetch(`${projectUrl}/functions/v1/${operation.functionName}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sync-secret": syncSecret },
        body: JSON.stringify(secretOperationBody(operation.key)),
        signal: AbortSignal.timeout(55_000),
      });
      resultPayload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(`동기화 함수가 HTTP ${result.status}로 응답했습니다.`);
    } else {
      const body = operation.target === "team" ? { teamId } : operation.target === "fixture" ? { fixtureId } : {};
      const result = await context.client.functions.invoke(operation.functionName, { body });
      if (result.error) throw result.error;
      resultPayload = result.data;
    }

    if (operation.key === "team-squad") {
      await context.client.rpc("capture_player_squad_snapshot", { p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_source: "SportsMonks 동기화 후", p_sync_run_id: runId });
      await context.client.rpc("reconcile_provider_player_change_candidates", { p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_sync_run_id: runId });
    }
    const completedAt = new Date().toISOString();
    const finalStatus = (resultPayload as { status?: unknown } | null)?.status;
    const finalization = await context.client.from("sync_runs").update({ status: finalStatus === "pending" || finalStatus === "already-running" ? "partial" : "succeeded", finished_at: completedAt, metadata: { operationKey: operation.key, providerQuota: quotaMetadata, ...safeResult(resultPayload) } }).eq("id", runId);
    if (finalization.error) {
      return { status: "warning", message: `${operation.label} 동기화는 완료됐지만 실행 기록을 마무리하지 못했습니다. 중복 실행하지 말고 기록을 확인해 주세요.`, operation: operation.key, completedAt };
    }
    const message = finalStatus === "cached"
      ? `${operation.label}: 최근 데이터가 있어 캐시를 사용했습니다.`
      : finalStatus === "pending" || finalStatus === "already-running"
        ? `${operation.label}: 이미 실행 중이거나 쿨다운 대기 중입니다.`
        : `${operation.label} 동기화 요청이 완료되었습니다.`;
    return { status: finalStatus === "pending" || finalStatus === "already-running" ? "warning" : "success", message, operation: operation.key, completedAt };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = safeMessage(error);
    await context.client.from("sync_runs").update({ status: "failed", finished_at: completedAt, failed_count: 1, error_code: "sync_failure", error_message: message, metadata: { operationKey: operation.key, providerQuota: quotaMetadata } }).eq("id", runId);
    throw new Error(message);
  }
}

export async function handler(event: LambdaEvent): Promise<LambdaResponse> {
  const origin = allowedOrigin(event);
  if (origin === false) return response(event, 403, { error: "허용되지 않은 Origin입니다." });
  if (method(event) === "OPTIONS") {
    return { statusCode: 204, headers: { "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "Authorization,Content-Type", "access-control-max-age": "600", ...(origin ? { "access-control-allow-origin": origin } : {}) }, body: "" };
  }

  const admin = await authenticate(event);
  if (!admin) return response(event, 401, { error: "활성 관리자 로그인이 필요합니다." });
  const requestPath = path(event);
  try {
    if (method(event) === "GET" && requestPath.endsWith("/admin/usage/metrics")) {
      if (!hasAdminPermission(admin.role, "system.read")) return response(event, 403, { error: "시스템 조회 권한이 없습니다." });
      return response(event, 200, {
        ...await getSupabaseProjectMetrics(),
        databaseLimitBytes: decimalGigabytesInBytes(process.env.SUPABASE_DATABASE_LIMIT_GB),
        providerAllowance: positiveNumber(process.env.SPORTSMONKS_API_ALLOWANCE),
      });
    }
    if (method(event) === "GET" && requestPath.endsWith("/admin/usage/storage")) {
      if (!hasAdminPermission(admin.role, "system.read")) return response(event, 403, { error: "시스템 조회 권한이 없습니다." });
      return response(event, 200, {
        ...await getSupabaseStorageUsage(),
        storageLimitBytes: decimalGigabytesInBytes(process.env.SUPABASE_STORAGE_LIMIT_GB),
      });
    }
    if (method(event) === "POST" && requestPath.endsWith("/admin/actions")) {
      const body = parseBody(event);
      if (!body || typeof body !== "object" || Array.isArray(body)) return response(event, 400, { error: "JSON 요청 본문이 필요합니다." });
      const record = body as { action?: unknown; payload?: unknown };
      if (record.action !== "runSync" || !record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) return response(event, 400, { error: "지원하지 않는 관리자 작업입니다." });
      return response(event, 200, await runSync(admin, record.payload as Record<string, unknown>));
    }
    return response(event, 404, { error: "관리자 API 경로를 찾을 수 없습니다." });
  } catch (error) {
    return response(event, 400, { error: safeMessage(error) });
  }
}

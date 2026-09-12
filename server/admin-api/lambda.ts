import { CURRENT_SEASON, isLeagueId, SUPPORTED_LEAGUES, seasonBounds, type LeagueId } from "../../src/lib/football/config.ts";
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedSuspensionDays = new Set([1, 3, 7, 30, 90, 365]);

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

export function secretOperationBody(operationKey: string, leagueId: LeagueId, season: number) {
  const config = SUPPORTED_LEAGUES.find((league) => league.id === leagueId);
  if (!config || season !== CURRENT_SEASON) throw new Error("지원하지 않는 리그 또는 시즌입니다.");
  const providerScope = { leagueId: config.providerLeagueId, seasonId: config.seasons[CURRENT_SEASON], season };
  if (operationKey === "live") {
    return {
      leagueId,
      providerLeagueId: config.providerLeagueId,
      seasonId: config.seasons[CURRENT_SEASON],
      season,
      mode: "live",
      pollCount: 0,
    };
  }
  const scope = providerScope;
  if (operationKey === "post-match") return { ...scope, postMatch: true, syncLineups: false, lineupFixtureLimit: 0 };
  if (operationKey === "history-backfill") return { ...scope, mode: "backfill-history" };
  return { ...scope, syncLineups: true };
}

export function secretOperationBodies(operationKey: string, leagueId: LeagueId | "all", season: number) {
  if (season !== CURRENT_SEASON) throw new Error("지원하지 않는 시즌입니다.");
  if (operationKey === "live") return [{ mode: "live", pollCount: 0 }];
  const leagues = leagueId === "all"
    ? SUPPORTED_LEAGUES
    : SUPPORTED_LEAGUES.filter((league) => league.id === leagueId);
  if (!leagues.length) throw new Error("지원하지 않는 리그입니다.");
  return leagues.map((league) => secretOperationBody(operationKey, league.id, season));
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

async function resolveTargetLeague(client: SupabaseClient, target: "none" | "team" | "fixture", targetId: string | null, season: number): Promise<LeagueId | "all"> {
  if (target === "none") return "all";
  if (!targetId) throw new Error(target === "team" ? "대상 구단을 선택해 주세요." : "대상 경기를 선택해 주세요.");
  if (target === "team") {
    const result = await client.from("league_standings").select("team_id,league_id")
      .eq("team_id", targetId).eq("season", season)
      .in("league_id", SUPPORTED_LEAGUES.map((league) => league.id)).limit(2);
    if (result.error) throw new Error("대상 구단을 확인할 수 없습니다.");
    const leagues = Array.from(new Set((result.data ?? []).map((row) => row.league_id).filter(isLeagueId)));
    if (leagues.length !== 1) throw new Error("현재 시즌에 등록된 대상 구단을 찾을 수 없습니다.");
    return leagues[0];
  }
  const result = await client.from("fixtures").select("id,league_id").eq("id", targetId).gte("kickoff_at", seasonBounds(season).start).lt("kickoff_at", seasonBounds(season).end).maybeSingle();
  if (result.error) throw new Error("대상 경기를 확인할 수 없습니다.");
  if (!result.data || !isLeagueId(result.data.league_id)) throw new Error("현재 시즌에 등록된 대상 경기를 찾을 수 없습니다.");
  return result.data.league_id;
}

function safeResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/token|secret|authorization|playerNames/i.test(key)).slice(0, 30));
}

function getSecretAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_ADMIN_SECRET_KEY?.trim()
    || process.env.SUPABASE_METRICS_SECRET_KEY?.trim();
  if (!url || !secretKey) throw new Error("계정 정지에 필요한 서버 전용 Supabase 설정이 없습니다.");
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function previousBanDuration(bannedUntil: string | undefined) {
  const remainingMilliseconds = bannedUntil ? Date.parse(bannedUntil) - Date.now() : 0;
  return Number.isFinite(remainingMilliseconds) && remainingMilliseconds > 0
    ? `${Math.max(1, Math.ceil(remainingMilliseconds / 1_000))}s`
    : "none";
}

async function runUserAccountAction(context: AdminContext, payload: Record<string, unknown>) {
  if (!hasAdminPermission(context.role, "users.moderate")) throw new Error("사용자 조치 권한이 없습니다.");

  const userId = String(payload.userId ?? "").trim();
  const action = String(payload.action ?? "").trim().toUpperCase();
  const reason = String(payload.reason ?? "").trim();
  const reportId = String(payload.reportId ?? "").trim();
  const suspensionDays = Number(payload.suspensionDays);
  if (!uuidPattern.test(userId) || !["ACCOUNT_SUSPEND", "ACCOUNT_UNSUSPEND"].includes(action)) {
    throw new Error("사용자 또는 계정 조치 유형이 올바르지 않습니다.");
  }
  if (reason.length < 3 || reason.length > 1_000) throw new Error("조치 사유를 3자 이상 1,000자 이하로 입력해 주세요.");
  if (reportId && !uuidPattern.test(reportId)) throw new Error("연결할 신고 ID가 올바르지 않습니다.");
  if (action === "ACCOUNT_SUSPEND" && (!Number.isInteger(suspensionDays) || !allowedSuspensionDays.has(suspensionDays))) {
    throw new Error("정지 기간을 선택해 주세요.");
  }

  const secretClient = getSecretAdminClient();
  const [userResult, profileResult, adminMembershipResult] = await Promise.all([
    secretClient.auth.admin.getUserById(userId),
    secretClient.from("profiles").select("id").eq("id", userId).maybeSingle(),
    secretClient.from("admin_users").select("is_active").eq("user_id", userId).maybeSingle(),
  ]);
  if (userResult.error || !userResult.data.user) throw new Error("정지할 인증 계정을 찾을 수 없습니다.");
  if (profileResult.error || !profileResult.data) throw new Error("정지할 사용자 프로필을 찾을 수 없습니다.");
  if (adminMembershipResult.error) throw new Error("대상 사용자의 관리자 여부를 확인하지 못했습니다.");
  if (adminMembershipResult.data?.is_active && !hasAdminPermission(context.role, "admins.manage")) {
    throw new Error("활성 관리자 계정은 최고 관리자만 정지할 수 있습니다.");
  }

  const bannedUntil = userResult.data.user.banned_until;
  const suspendedUntil = action === "ACCOUNT_SUSPEND"
    ? new Date(Date.now() + suspensionDays * 86_400_000).toISOString()
    : null;
  const banDuration = action === "ACCOUNT_SUSPEND" ? `${suspensionDays * 24}h` : "none";
  const authUpdate = await secretClient.auth.admin.updateUserById(userId, { ban_duration: banDuration });
  if (authUpdate.error) throw new Error("Supabase 인증 계정의 정지 상태를 변경하지 못했습니다.");

  const databaseUpdate = await context.client.rpc("admin_apply_user_action", {
    p_user_id: userId,
    p_action: action,
    p_reason: reason,
    p_suspended_until: suspendedUntil,
    p_content_report_id: reportId || null,
  });
  if (databaseUpdate.error) {
    const rollback = await secretClient.auth.admin.updateUserById(userId, {
      ban_duration: previousBanDuration(bannedUntil),
    });
    if (rollback.error) throw new Error("계정 기록에 실패했고 인증 상태도 자동 복구하지 못했습니다. 즉시 관리자 확인이 필요합니다.");
    throw new Error("계정 상태를 기록하지 못해 인증 변경을 되돌렸습니다.");
  }

  return {
    status: "success",
    message: action === "ACCOUNT_SUSPEND" ? "계정 전체 이용을 정지했습니다." : "계정 정지를 해제했습니다.",
  };
}

async function requireSyncRpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error("선수단 스냅샷 또는 변경 감지 처리에 실패했습니다. 실행 기록을 확인해 주세요.");
  return result.data;
}

async function runSync(context: AdminContext, payload: Record<string, unknown>) {
  if (!hasAdminPermission(context.role, "sync.run")) throw new Error("동기화 실행 권한이 없습니다.");
  const season = Number(payload.season);
  if (season !== CURRENT_SEASON) throw new Error("동기화할 시즌을 확인해 주세요.");
  const operationKey = String(payload.operation ?? "");
  const operation = getSyncOperation(operationKey);
  const reason = String(payload.reason ?? "").trim();
  const teamId = String(payload.teamId ?? "").trim();
  const fixtureId = String(payload.fixtureId ?? "").trim();
  const confirmedLowQuota = payload.confirmLowQuota === "yes";
  if (!operation) throw new Error("지원하지 않는 동기화 작업입니다.");
  if (reason.length < 3 || reason.length > 500) throw new Error("실행 이유를 3자 이상 500자 이하로 입력해 주세요.");
  const targetId = operation.target === "team" ? teamId : operation.target === "fixture" ? fixtureId : null;
  const leagueId = await resolveTargetLeague(context.client, operation.target, targetId, season);
  const configs = leagueId === "all"
    ? [...SUPPORTED_LEAGUES]
    : SUPPORTED_LEAGUES.filter((league) => league.id === leagueId);
  const targetLeagueId = leagueId === "all" ? null : leagueId;
  const scopeMetadata = leagueId === "all"
    ? {
        leagueId: "all",
        season,
        leagues: configs.map((config) => ({ leagueId: config.id, providerLeagueId: config.providerLeagueId, providerSeasonId: config.seasons[CURRENT_SEASON] })),
      }
    : {
        leagueId,
        season,
        providerLeagueId: configs[0].providerLeagueId,
        providerSeasonId: configs[0].seasons[CURRENT_SEASON],
      };

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
    metadata: { operationKey: operation.key, providerQuota: quotaMetadata, ...scopeMetadata },
  }).select("id").maybeSingle();
  const runId = runResult.data?.id ? String(runResult.data.id) : null;
  if (runResult.error || !runId) throw new Error("실행 기록을 만들지 못해 동기화를 시작하지 않았습니다.");

  try {
    if (operation.key === "team-squad") {
      if (!targetLeagueId) throw new Error("대상 구단의 리그를 확인할 수 없습니다.");
      await requireSyncRpc(context.client, "capture_player_squad_snapshot", { p_team_id: teamId, p_season: season, p_league_id: targetLeagueId, p_source: "동기화 전", p_sync_run_id: runId });
    }

    let resultPayload: unknown;
    if (operation.requiresSecret) {
      const syncSecret = process.env.FOOTBALL_SYNC_SECRET?.trim();
      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      if (!syncSecret || !projectUrl) throw new Error("관리자 API의 동기화 비밀값 설정이 필요합니다.");
      const bodies = secretOperationBodies(operation.key, leagueId, season);
      const invocationBodies = operation.key === "full"
        ? [{ background: true, syncRunId: runId, requests: bodies }]
        : bodies;
      const results = await Promise.all(invocationBodies.map(async (body, index) => {
        const result = await fetch(`${projectUrl}/functions/v1/${operation.functionName}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-sync-secret": syncSecret },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(55_000),
        });
        const responseBody = await result.json().catch(() => ({}));
        const scopeLabel = leagueId === "all" && bodies.length === 1 ? "전체 리그" : configs[index]?.label ?? "전체 리그";
        if (!result.ok) {
          const providerMessage = responseBody && typeof responseBody === "object" && !Array.isArray(responseBody)
            && typeof (responseBody as { error?: unknown }).error === "string"
            ? (responseBody as { error: string }).error.trim()
            : "";
          throw new Error(`${scopeLabel} 동기화 함수가 HTTP ${result.status}로 응답했습니다.${providerMessage ? ` ${providerMessage}` : ""}`);
        }
        return { leagueId: invocationBodies.length === 1 && bodies.length > 1 ? "all" : configs[index]?.id ?? "all", result: responseBody };
      }));
      if (results.length === 1) {
        resultPayload = results[0].result;
      } else {
        const statuses = results.map(({ result }) => (result as { status?: unknown } | null)?.status);
        resultPayload = {
          status: statuses.some((status) => status === "pending" || status === "already-running")
            ? "pending"
            : statuses.every((status) => status === "cached") ? "cached" : "succeeded",
          leagues: results.map(({ leagueId: resultLeagueId, result }) => ({
            leagueId: resultLeagueId,
            status: (result as { status?: unknown } | null)?.status ?? "succeeded",
          })),
        };
      }
    } else {
      const results = await Promise.all(configs.map(async (config) => {
        const body = {
          leagueId: config.id,
          providerLeagueId: config.providerLeagueId,
          providerSeasonId: config.seasons[CURRENT_SEASON],
          seasonId: config.seasons[CURRENT_SEASON],
          season,
          ...(operation.target === "team" ? { teamId } : operation.target === "fixture" ? { fixtureId } : {}),
        };
        const result = await context.client.functions.invoke(operation.functionName, { body });
        if (result.error) throw result.error;
        return { leagueId: config.id, result: result.data };
      }));
      resultPayload = results.length === 1 ? results[0].result : {
        status: "succeeded",
        leagues: results.map(({ leagueId: resultLeagueId, result }) => ({
          leagueId: resultLeagueId,
          status: (result as { status?: unknown } | null)?.status ?? "succeeded",
        })),
      };
    }

    if (operation.key === "team-squad") {
      if (!targetLeagueId) throw new Error("대상 구단의 리그를 확인할 수 없습니다.");
      await requireSyncRpc(context.client, "capture_player_squad_snapshot", { p_team_id: teamId, p_season: season, p_league_id: targetLeagueId, p_source: "SportsMonks 동기화 후", p_sync_run_id: runId });
      await requireSyncRpc(context.client, "reconcile_provider_player_change_candidates", { p_team_id: teamId, p_season: season, p_league_id: targetLeagueId, p_sync_run_id: runId });
    }
    const completedAt = new Date().toISOString();
    const finalStatus = (resultPayload as { status?: unknown } | null)?.status;
    if (finalStatus === "accepted") {
      return {
        status: "success",
        message: `${operation.label} 동기화를 시작했습니다. 완료 상태는 데이터 관리에서 확인할 수 있습니다.`,
        operation: operation.key,
        completedAt: startedAt,
      };
    }
    const finalization = await context.client.from("sync_runs").update({ status: finalStatus === "pending" || finalStatus === "already-running" ? "partial" : "succeeded", finished_at: completedAt, metadata: { ...safeResult(resultPayload), operationKey: operation.key, providerQuota: quotaMetadata, ...scopeMetadata } }).eq("id", runId);
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
    await context.client.from("sync_runs").update({ status: "failed", finished_at: completedAt, failed_count: 1, error_code: "sync_failure", error_message: message, metadata: { operationKey: operation.key, providerQuota: quotaMetadata, ...scopeMetadata } }).eq("id", runId);
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
      if (!record.payload || typeof record.payload !== "object" || Array.isArray(record.payload)) return response(event, 400, { error: "지원하지 않는 관리자 작업입니다." });
      if (record.action === "runSync") return response(event, 200, await runSync(admin, record.payload as Record<string, unknown>));
      if (record.action === "applyUserAccountAction") return response(event, 200, await runUserAccountAction(admin, record.payload as Record<string, unknown>));
      return response(event, 400, { error: "지원하지 않는 관리자 작업입니다." });
    }
    return response(event, 404, { error: "관리자 API 경로를 찾을 수 없습니다." });
  } catch (error) {
    return response(event, 400, { error: safeMessage(error) });
  }
}

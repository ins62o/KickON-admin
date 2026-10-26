import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { getSupabaseConnection } from "@/lib/data/supabase";

export const errorSources = ["ios", "android", "web", "edge_function", "database", "cron", "other"] as const;
export const errorSeverities = ["info", "warning", "error", "fatal"] as const;

export type ErrorSource = (typeof errorSources)[number];
export type ErrorSeverity = (typeof errorSeverities)[number];

export type ErrorEventPayload = {
  fingerprint?: unknown;
  source?: unknown;
  title?: unknown;
  errorType?: unknown;
  severity?: unknown;
  occurredAt?: unknown;
  environment?: unknown;
  release?: unknown;
  osName?: unknown;
  osVersion?: unknown;
  deviceModel?: unknown;
  route?: unknown;
  apiEndpoint?: unknown;
  httpStatus?: unknown;
  operation?: unknown;
  message?: unknown;
  stackTrace?: unknown;
  requestId?: unknown;
  context?: unknown;
};

export type ErrorIngestResult =
  | { ok: true; groupId: string }
  | { ok: false; code: "INGEST_NOT_CONFIGURED" | "INVALID_ERROR_EVENT" | "INGEST_FAILED" };

const allowedSources = new Set<string>(errorSources);
const allowedSeverities = new Set<string>(errorSeverities);
const sensitiveKey = /token|secret|password|passcode|authorization|cookie|session|email|phone|otp|verification|credential|refresh|access[_-]?key|user[_-]?id|account[_-]?id|reporter[_-]?id/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const phonePattern = /(?<!\d)(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)/g;
const namedSecretPattern = /\b(password|passcode|authorization|cookie|session|otp|verification[_-]?code|token|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|client[_-]?secret|credential)\b(\s*[:=]\s*)["']?[^\s,;"'&}]+/gi;

export function sanitizeErrorText(value: unknown, maximum = 2_000) {
  if (typeof value !== "string") return "";
  return value
    .replace(bearerPattern, "[REDACTED_BEARER]")
    .replace(jwtPattern, "[REDACTED_JWT]")
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(namedSecretPattern, (_match, key: string, separator: string) => `${key}${separator}[REDACTED]`)
    .trim()
    .slice(0, maximum);
}

export function sanitizeErrorContext(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED_DEPTH]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") return sanitizeErrorText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeErrorContext(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [
      key.slice(0, 100), sensitiveKey.test(key) ? "[REDACTED]" : sanitizeErrorContext(item, depth + 1),
    ]));
  }
  return sanitizeErrorText(String(value), 500);
}

export function safeSecretEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isErrorEventPayload(value: unknown): value is ErrorEventPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function httpStatus(value: unknown) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function occurredAt(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

export async function ingestErrorEvent(
  payload: ErrorEventPayload,
  options: { authenticatedUserId?: string | null; requestId?: string | null } = {},
): Promise<ErrorIngestResult> {
  const source = sanitizeErrorText(payload.source, 40);
  const severity = sanitizeErrorText(payload.severity, 20) || "error";
  const message = sanitizeErrorText(payload.message, 2_000);
  const stackTrace = sanitizeErrorText(payload.stackTrace, 20_000);
  const errorType = sanitizeErrorText(payload.errorType, 120) || "unknown";
  const route = sanitizeErrorText(payload.route, 500);
  const apiEndpoint = sanitizeErrorText(payload.apiEndpoint, 500);
  if (!allowedSources.has(source) || !allowedSeverities.has(severity) || (!message && !stackTrace)) {
    return { ok: false, code: "INVALID_ERROR_EVENT" };
  }

  const status = httpStatus(payload.httpStatus);
  const fingerprintSource = [source, errorType, message.split("\n")[0], stackTrace.split("\n").slice(0, 3).join("\n"), route, apiEndpoint, status ?? ""].join("|");
  const suppliedFingerprint = sanitizeErrorText(payload.fingerprint, 200);
  const fingerprint = suppliedFingerprint.length >= 16 ? suppliedFingerprint : hash(fingerprintSource);
  const title = sanitizeErrorText(payload.title, 500) || message.split("\n")[0].slice(0, 500) || errorType;
  const hashSalt = process.env.ERROR_HASH_SALT;
  const userIdHash = options.authenticatedUserId && hashSalt ? hash(`${hashSalt}:${options.authenticatedUserId}`) : "";
  const context = sanitizeErrorContext(payload.context);
  const safeContext = context && typeof context === "object" && !Array.isArray(context) ? context : { value: context };

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return { ok: false, code: "INGEST_NOT_CONFIGURED" };

  try {
    const { data, error } = await client.rpc("ingest_sanitized_error_event", {
      p_fingerprint: fingerprint,
      p_source: source,
      p_title: title,
      p_error_type: errorType,
      p_severity: severity,
      p_occurred_at: occurredAt(payload.occurredAt),
      p_environment: sanitizeErrorText(payload.environment, 80),
      p_release: sanitizeErrorText(payload.release, 120),
      p_os_name: sanitizeErrorText(payload.osName, 80),
      p_os_version: sanitizeErrorText(payload.osVersion, 80),
      p_device_model: sanitizeErrorText(payload.deviceModel, 160),
      p_route: route,
      p_api_endpoint: apiEndpoint,
      p_http_status: status,
      p_operation: sanitizeErrorText(payload.operation, 200),
      p_message: message,
      p_stack_trace: stackTrace,
      p_user_id_hash: userIdHash,
      p_request_id: sanitizeErrorText(payload.requestId, 200) || sanitizeErrorText(options.requestId, 200),
      p_sanitized_context: safeContext,
    });
    if (error || !data) return { ok: false, code: "INGEST_FAILED" };
    return { ok: true, groupId: String(data) };
  } catch {
    return { ok: false, code: "INGEST_FAILED" };
  }
}

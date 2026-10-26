import "server-only";

import { sanitizeErrorContext, sanitizeErrorText } from "@/lib/errors/ingestion";
import { getSupabaseConnection } from "@/lib/data/supabase";

export const dataReportEntityTypes = ["team", "player", "fixture", "standing", "ranking", "other"] as const;

export type DataReportEntityType = (typeof dataReportEntityTypes)[number];

export type DataReportPayload = {
  entityType?: unknown;
  entityId?: unknown;
  fieldPath?: unknown;
  currentValue?: unknown;
  proposedValue?: unknown;
  description?: unknown;
  evidenceUrls?: unknown;
  clientRequestId?: unknown;
};

export type DataReportSubmitResult =
  | { ok: true; reportId: string; created: boolean }
  | { ok: false; code: "SUBMIT_NOT_CONFIGURED" | "INVALID_REPORT" | "RATE_LIMITED" | "ENTITY_NOT_FOUND" | "SUBMIT_FAILED" };

type NormalizedDataReport = {
  entityType: DataReportEntityType;
  entityId: string | null;
  fieldPath: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  description: string;
  evidenceUrls: string[];
  clientRequestId: string | null;
};

const allowedEntityTypes = new Set<string>(dataReportEntityTypes);
const clientRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const maximumValueBytes = 20_000;

export function isDataReportPayload(value: unknown): value is DataReportPayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeDataReportPayload(payload: DataReportPayload, fallbackRequestId?: string | null): NormalizedDataReport | null {
  const entityType = sanitizeErrorText(payload.entityType, 40);
  if (!allowedEntityTypes.has(entityType)) return null;

  const entityId = nullableText(payload.entityId, 200);
  if (entityType !== "other" && !entityId) return null;

  const description = sanitizeErrorText(payload.description, 4_000);
  if (description.length < 3) return null;

  const fieldPath = nullableText(payload.fieldPath, 200);
  const evidenceUrls = normalizeEvidenceUrls(payload.evidenceUrls);
  if (!evidenceUrls) return null;

  const currentValue = sanitizeReportValue(payload.currentValue);
  const proposedValue = sanitizeReportValue(payload.proposedValue);
  if (!currentValue.valid || !proposedValue.valid) return null;

  const explicitRequestId = nullableText(payload.clientRequestId, 120);
  if (explicitRequestId && !clientRequestIdPattern.test(explicitRequestId)) return null;
  const fallbackCandidate = nullableText(fallbackRequestId, 120);
  const requestIdCandidate = explicitRequestId ?? (fallbackCandidate && clientRequestIdPattern.test(fallbackCandidate) ? fallbackCandidate : null);

  return {
    entityType: entityType as DataReportEntityType,
    entityId,
    fieldPath,
    currentValue: currentValue.value,
    proposedValue: proposedValue.value,
    description,
    evidenceUrls,
    clientRequestId: requestIdCandidate,
  };
}

export async function submitDataReport(
  reporterId: string,
  payload: DataReportPayload,
  fallbackRequestId?: string | null,
): Promise<DataReportSubmitResult> {
  const normalized = normalizeDataReportPayload(payload, fallbackRequestId);
  if (!normalized) return { ok: false, code: "INVALID_REPORT" };

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return { ok: false, code: "SUBMIT_NOT_CONFIGURED" };

  try {
    const { data, error } = await client.rpc("submit_user_data_report", {
      p_reporter_id: reporterId,
      p_entity_type: normalized.entityType,
      p_entity_id: normalized.entityId,
      p_field_path: normalized.fieldPath,
      p_current_value: normalized.currentValue,
      p_proposed_value: normalized.proposedValue,
      p_description: normalized.description,
      p_evidence_urls: normalized.evidenceUrls,
      p_client_request_id: normalized.clientRequestId,
    });

    if (error) return { ok: false, code: submitErrorCode(error.code, error.message) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || !("report_id" in row)) return { ok: false, code: "SUBMIT_FAILED" };

    return {
      ok: true,
      reportId: String((row as Record<string, unknown>).report_id),
      created: (row as Record<string, unknown>).created !== false,
    };
  } catch {
    return { ok: false, code: "SUBMIT_FAILED" };
  }
}

function nullableText(value: unknown, maximum: number) {
  const text = sanitizeErrorText(value, maximum);
  return text || null;
}

function sanitizeReportValue(value: unknown): { valid: boolean; value: unknown } {
  if (value === undefined) return { valid: true, value: null };
  const sanitized = sanitizeErrorContext(value);
  const serialized = JSON.stringify(sanitized);
  if (serialized === undefined || Buffer.byteLength(serialized, "utf8") > maximumValueBytes) {
    return { valid: false, value: null };
  }
  return { valid: true, value: sanitized };
}

function normalizeEvidenceUrls(value: unknown) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 5) return null;

  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2_048) return null;
    try {
      const url = new URL(item);
      if (url.protocol !== "https:" || url.username || url.password) return null;
      url.search = "";
      url.hash = "";
      urls.push(url.toString());
    } catch {
      return null;
    }
  }
  return urls;
}

function submitErrorCode(code: string | undefined, message: string): Exclude<DataReportSubmitResult, { ok: true }>["code"] {
  if (code === "PGRST202" || code === "42883" || code === "42P01") return "SUBMIT_NOT_CONFIGURED";
  if (message.includes("REPORT_RATE_LIMIT")) return "RATE_LIMITED";
  if (message.includes("REPORT_ENTITY_NOT_FOUND")) return "ENTITY_NOT_FOUND";
  if (message.includes("INVALID_REPORT") || message.includes("REPORT_ENTITY_REQUIRED") || message.includes("REPORT_VALUE_TOO_LARGE")) return "INVALID_REPORT";
  return "SUBMIT_FAILED";
}

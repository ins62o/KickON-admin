import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseConnection } from "@/lib/data/supabase";
import { sanitizeErrorContext, sanitizeErrorText } from "@/lib/errors/ingestion";

export const providerPlayerChangeTypes = [
  "squad_added",
  "transfer",
  "loan_in",
  "loan_out",
  "loan_return",
  "released",
  "contract_expired",
  "squad_removed",
  "unknown",
] as const;

export type ProviderPlayerChangeType = (typeof providerPlayerChangeTypes)[number];

export type ProviderPlayerChangePayload = {
  provider?: unknown;
  sourceEndpoint?: unknown;
  syncRunId?: unknown;
  candidates?: unknown;
};

export type ProviderPlayerChangeIngestResult =
  | { ok: true; acceptedCount: number; createdCount: number; existingCount: number }
  | { ok: false; code: "INGEST_NOT_CONFIGURED" | "INVALID_CANDIDATES" | "ENTITY_NOT_FOUND" | "INGEST_FAILED" };

type CandidatePayload = {
  sourceEventId?: unknown;
  playerId?: unknown;
  playerName?: unknown;
  fromTeamId?: unknown;
  fromTeamName?: unknown;
  toTeamId?: unknown;
  toTeamName?: unknown;
  changeType?: unknown;
  movementDate?: unknown;
  observedAt?: unknown;
  beforeValue?: unknown;
  afterValue?: unknown;
};

type NormalizedCandidate = {
  dedupeKey: string;
  playerId: string;
  playerName: string;
  fromTeamId: string | null;
  fromTeamName: string | null;
  toTeamId: string | null;
  toTeamName: string | null;
  changeType: ProviderPlayerChangeType;
  movementDate: string | null;
  observedAt: string;
  beforeValue: unknown;
  afterValue: unknown;
};

type NormalizedBatch = {
  provider: "sportmonks";
  sourceReference: string;
  syncRunId: string | null;
  candidates: NormalizedCandidate[];
};

const allowedChangeTypes = new Set<string>(providerPlayerChangeTypes);
const playerIdPattern = /^[A-Za-z0-9._:-]{1,160}$/;
const teamIdPattern = /^[A-Za-z0-9-]{1,80}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumValueBytes = 20_000;
const maximumBatchBytes = 256_000;

export function isProviderPlayerChangePayload(value: unknown): value is ProviderPlayerChangePayload {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeProviderPlayerChangePayload(payload: ProviderPlayerChangePayload, now = new Date()): NormalizedBatch | null {
  const provider = sanitizeErrorText(payload.provider, 40).toLowerCase();
  if (provider !== "sportmonks") return null;

  const sourceReference = safeSourceReference(payload.sourceEndpoint);
  if (!sourceReference) return null;
  const syncRunId = optionalText(payload.syncRunId, 80);
  if (syncRunId === undefined || (syncRunId !== null && !uuidPattern.test(syncRunId))) return null;
  if (!Array.isArray(payload.candidates) || payload.candidates.length < 1 || payload.candidates.length > 100) return null;

  const candidates: NormalizedCandidate[] = [];
  for (const rawCandidate of payload.candidates) {
    const candidate = normalizeCandidate(rawCandidate, provider, now);
    if (!candidate) return null;
    candidates.push(candidate);
  }

  const normalized: NormalizedBatch = { provider: "sportmonks", sourceReference, syncRunId, candidates };
  return Buffer.byteLength(JSON.stringify(normalized), "utf8") <= maximumBatchBytes ? normalized : null;
}

export async function ingestProviderPlayerChanges(payload: ProviderPlayerChangePayload): Promise<ProviderPlayerChangeIngestResult> {
  const normalized = normalizeProviderPlayerChangePayload(payload);
  if (!normalized) return { ok: false, code: "INVALID_CANDIDATES" };

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return { ok: false, code: "INGEST_NOT_CONFIGURED" };

  try {
    const { data, error } = await client.rpc("ingest_provider_player_change_candidates", {
      p_provider: normalized.provider,
      p_source_reference: normalized.sourceReference,
      p_sync_run_id: normalized.syncRunId,
      p_candidates: normalized.candidates,
    });
    if (error) return { ok: false, code: ingestErrorCode(error.code, error.message) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { ok: false, code: "INGEST_FAILED" };
    const record = row as Record<string, unknown>;
    const acceptedCount = nonNegativeInteger(record.accepted_count);
    const createdCount = nonNegativeInteger(record.created_count);
    const existingCount = nonNegativeInteger(record.existing_count);
    if (acceptedCount === null || createdCount === null || existingCount === null || createdCount + existingCount !== acceptedCount) {
      return { ok: false, code: "INGEST_FAILED" };
    }
    return { ok: true, acceptedCount, createdCount, existingCount };
  } catch {
    return { ok: false, code: "INGEST_FAILED" };
  }
}

function normalizeCandidate(value: unknown, provider: string, now: Date): NormalizedCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as CandidatePayload;
  const playerId = nullableText(candidate.playerId, 160);
  const playerName = nullableText(candidate.playerName, 200);
  if (!playerId || !playerIdPattern.test(playerId) || !playerName) return null;

  const fromTeamId = optionalPatternText(candidate.fromTeamId, 80, teamIdPattern);
  const toTeamId = optionalPatternText(candidate.toTeamId, 80, teamIdPattern);
  if (fromTeamId === undefined || toTeamId === undefined) return null;
  const fromTeamName = optionalText(candidate.fromTeamName, 200);
  const toTeamName = optionalText(candidate.toTeamName, 200);
  if (fromTeamName === undefined || toTeamName === undefined) return null;
  if (!fromTeamId && !toTeamId && !fromTeamName && !toTeamName) return null;

  const changeType = nullableText(candidate.changeType, 40);
  if (!changeType || !allowedChangeTypes.has(changeType)) return null;
  if (["squad_added", "loan_in"].includes(changeType) && !toTeamId && !toTeamName) return null;
  if (["squad_removed", "loan_out", "released", "contract_expired"].includes(changeType) && !fromTeamId && !fromTeamName) return null;

  const movementDate = normalizeDate(candidate.movementDate);
  if (movementDate === undefined) return null;
  const observedAt = normalizeObservedAt(candidate.observedAt, now);
  if (!observedAt) return null;

  const sourceEventId = optionalText(candidate.sourceEventId, 160);
  if (sourceEventId === undefined) return null;
  const beforeValue = normalizeValue(candidate.beforeValue, { teamId: fromTeamId, teamName: fromTeamName });
  const afterValue = normalizeValue(candidate.afterValue, { teamId: toTeamId, teamName: toTeamName, providerEventId: sourceEventId });
  if (!beforeValue.valid || !afterValue.valid) return null;

  const dedupeInput = sourceEventId
    ? [provider, "event", sourceEventId]
    : [provider, "candidate", playerId, fromTeamId ?? normalizedName(fromTeamName), toTeamId ?? normalizedName(toTeamName), changeType, movementDate ?? ""];
  const dedupeKey = createHash("sha256").update(dedupeInput.join("|")).digest("hex");

  return {
    dedupeKey,
    playerId,
    playerName,
    fromTeamId,
    fromTeamName,
    toTeamId,
    toTeamName,
    changeType: changeType as ProviderPlayerChangeType,
    movementDate,
    observedAt,
    beforeValue: beforeValue.value,
    afterValue: afterValue.value,
  };
}

function safeSourceReference(value: unknown) {
  if (typeof value !== "string") return "";
  const withoutQuery = value.trim().split(/[?#]/, 1)[0];
  if (!withoutQuery || withoutQuery.length > 500 || /[\u0000-\u001f\u007f\s]/.test(withoutQuery)) return "";
  if (/^https?:\/\//i.test(withoutQuery)) {
    try {
      const url = new URL(withoutQuery);
      if (url.protocol !== "https:" || url.username || url.password) return "";
      return sanitizeErrorText(`${url.origin}${url.pathname}`, 500);
    } catch {
      return "";
    }
  }
  return /^[A-Za-z0-9/._:-]+$/.test(withoutQuery) ? withoutQuery : "";
}

function optionalPatternText(value: unknown, maximum: number, pattern: RegExp): string | null | undefined {
  const text = optionalText(value, maximum);
  return text === undefined || (text !== null && !pattern.test(text)) ? undefined : text;
}

function optionalText(value: unknown, maximum: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = sanitizeErrorText(value, maximum);
  return text || undefined;
}

function nullableText(value: unknown, maximum: number) {
  return typeof value === "string" ? sanitizeErrorText(value, maximum) || null : null;
}

function normalizeDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function normalizeObservedAt(value: unknown, now: Date) {
  const parsed = typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value) : value === undefined || value === null ? now : null;
  if (!parsed) return null;
  const timestamp = parsed.getTime();
  if (timestamp < now.getTime() - 365 * 86_400_000 || timestamp > now.getTime() + 86_400_000) return null;
  return parsed.toISOString();
}

function normalizeValue(value: unknown, fallback: Record<string, unknown>): { valid: boolean; value: unknown } {
  const sanitized = value === undefined ? fallback : sanitizeErrorContext(value);
  const serialized = JSON.stringify(sanitized);
  return serialized !== undefined && Buffer.byteLength(serialized, "utf8") <= maximumValueBytes
    ? { valid: true, value: sanitized }
    : { valid: false, value: null };
}

function normalizedName(value: string | null) {
  return value?.toLocaleLowerCase().replace(/[^a-z0-9가-힣]/g, "") ?? "";
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function ingestErrorCode(code: string | undefined, message: string): Exclude<ProviderPlayerChangeIngestResult, { ok: true }>["code"] {
  if (code === "PGRST202" || code === "42883" || code === "42P01") return "INGEST_NOT_CONFIGURED";
  if (message.includes("TEAM_NOT_FOUND")) return "ENTITY_NOT_FOUND";
  if (message.includes("INVALID_") || message.includes("UNSUPPORTED_") || message.includes("_REQUIRED")) return "INVALID_CANDIDATES";
  return "INGEST_FAILED";
}

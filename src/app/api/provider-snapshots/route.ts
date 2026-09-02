import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseConnection } from "@/lib/data/supabase";

const entityFields: Record<string, Set<string>> = {
  team: new Set(["name", "short_name", "code"]),
  player: new Set(["team_id", "player_name", "display_name", "display_name_ko", "shirt_number", "position", "detailed_position", "height", "weight", "date_of_birth", "in_squad"]),
  fixture: new Set(["round", "home_team_id", "away_team_id", "stadium_id", "kickoff_at", "status", "home_score", "away_score"]),
  standing: new Set(["rank", "played", "won", "drawn", "lost", "goals_for", "goals_against", "goal_difference", "points", "clean_sheets", "average_possession"]),
  ranking: new Set(["team_id", "goals", "assists", "appearances", "starts", "minutes", "yellow_cards", "red_cards"]),
  transfer: new Set(["player_id", "from_team_id", "to_team_id", "movement_type", "movement_date"]),
};
const sensitiveKey = /token|secret|password|passcode|authorization|cookie|session|email|phone|otp|verification|credential|refresh|access[_-]?key|user[_-]?id|account[_-]?id|reporter[_-]?id/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const phonePattern = /(?<!\d)(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)/g;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SnapshotPayload = {
  provider?: unknown; entityType?: unknown; entityId?: unknown; providerEntityId?: unknown;
  season?: unknown; leagueId?: unknown; sourceEndpoint?: unknown; fetchedAt?: unknown;
  requestId?: unknown; syncRunId?: unknown; rawPayload?: unknown; comparableValue?: unknown;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function scrubText(value: string) {
  return value
    .replace(bearerPattern, "[REDACTED_BEARER]")
    .replace(jwtPattern, "[REDACTED_JWT]")
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, "[REDACTED_PHONE]");
}

function safeEndpoint(value: unknown) {
  return scrubText(text(value, 500)).split(/[?#]/, 1)[0];
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED_DEPTH]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return scrubText(value).slice(0, 20_000);
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => scrub(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 500).map(([key, item]) => [
      key.slice(0, 120), sensitiveKey.test(key) ? "[REDACTED]" : scrub(item, depth + 1),
    ]));
  }
  return String(value).slice(0, 1000);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function comparable(entityType: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const allowed = entityFields[entityType];
  if (!allowed) return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => allowed.has(key) && (item === null || ["string", "number", "boolean"].includes(typeof item)))
    .map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 1000) : item]));
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 512_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

  const suppliedSecret = request.headers.get("x-kickon-provider-snapshot-secret") ?? request.headers.get("x-football-sync-secret") ?? "";
  const expectedSecrets = [process.env.KICKON_PROVIDER_SNAPSHOT_SECRET, process.env.FOOTBALL_SYNC_SECRET].filter((value): value is string => Boolean(value));
  if (expectedSecrets.length === 0) return NextResponse.json({ error: "SNAPSHOT_INGEST_NOT_CONFIGURED" }, { status: 503 });
  if (!suppliedSecret || !expectedSecrets.some((secret) => safeEqual(suppliedSecret, secret))) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return NextResponse.json({ error: "SERVICE_ROLE_NOT_CONFIGURED" }, { status: 503 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 512_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const body = (() => {
    try { return JSON.parse(rawBody) as SnapshotPayload; } catch { return null; }
  })();
  if (!body) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

  const provider = text(body.provider, 80);
  const entityType = text(body.entityType, 40);
  const entityId = text(body.entityId, 160);
  const safeComparable = comparable(entityType, body.comparableValue);
  const safeRaw = scrub(body.rawPayload);
  if (provider.length < 2 || !entityFields[entityType] || !entityId || !safeComparable || Object.keys(safeComparable).length === 0 || !safeRaw || typeof safeRaw !== "object") {
    return NextResponse.json({ error: "INVALID_PROVIDER_SNAPSHOT" }, { status: 400 });
  }
  const serialized = stable({ rawPayload: safeRaw, comparableValue: safeComparable });
  if (Buffer.byteLength(serialized, "utf8") > 512_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

  const rawSeason = Number(body.season);
  const season = Number.isInteger(rawSeason) && rawSeason >= 2000 && rawSeason <= 2200 ? rawSeason : null;
  const leagueId = text(body.leagueId, 80);
  if ((entityType === "fixture" || entityType === "standing") && (!season || !leagueId)) {
    return NextResponse.json({ error: "SEASON_AND_LEAGUE_REQUIRED" }, { status: 400 });
  }
  const fetchedAt = typeof body.fetchedAt === "string" && !Number.isNaN(Date.parse(body.fetchedAt)) ? new Date(body.fetchedAt).toISOString() : new Date().toISOString();
  const syncRunId = typeof body.syncRunId === "string" && uuidPattern.test(body.syncRunId) ? body.syncRunId : null;
  const snapshotHash = createHash("sha256").update(serialized).digest("hex");
  const { data, error } = await client.rpc("ingest_provider_entity_snapshot", {
    p_provider: provider,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_provider_entity_id: text(body.providerEntityId, 160),
    p_season: season,
    p_league_id: leagueId,
    p_source_endpoint: safeEndpoint(body.sourceEndpoint),
    p_raw_payload: safeRaw,
    p_comparable_value: safeComparable,
    p_snapshot_hash: snapshotHash,
    p_fetched_at: fetchedAt,
    p_request_id: text(body.requestId, 200) || text(request.headers.get("x-request-id"), 200),
    p_sync_run_id: syncRunId,
  });
  if (error) return NextResponse.json({ error: "SNAPSHOT_INGEST_FAILED" }, { status: 500 });
  return NextResponse.json({ accepted: true, snapshotId: data, comparableFields: Object.keys(safeComparable) }, { status: 202 });
}

import { NextResponse } from "next/server";
import { safeSecretEqual } from "@/lib/errors/ingestion";
import { ingestProviderPlayerChanges, isProviderPlayerChangePayload } from "@/lib/transfers/ingestion";

const maximumPayloadBytes = 256_000;
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumPayloadBytes) return response("PAYLOAD_TOO_LARGE", 413);

  const suppliedSecret = request.headers.get("x-kickon-provider-snapshot-secret")
    ?? request.headers.get("x-football-sync-secret")
    ?? "";
  if (!suppliedSecret) return response("UNAUTHORIZED", 401);
  const expectedSecrets = [process.env.KICKON_PROVIDER_SNAPSHOT_SECRET, process.env.FOOTBALL_SYNC_SECRET]
    .filter((value): value is string => Boolean(value));
  if (expectedSecrets.length === 0) return response("INGEST_NOT_CONFIGURED", 503);
  if (!expectedSecrets.some((secret) => safeSecretEqual(suppliedSecret, secret))) return response("UNAUTHORIZED", 401);

  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > maximumPayloadBytes) return response("PAYLOAD_TOO_LARGE", 413);
  const body = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  if (!isProviderPlayerChangePayload(body)) return response("INVALID_JSON", 400);

  const result = await ingestProviderPlayerChanges(body);
  if (!result.ok) {
    const status = result.code === "INGEST_NOT_CONFIGURED"
      ? 503
      : result.code === "ENTITY_NOT_FOUND"
        ? 404
        : result.code === "INVALID_CANDIDATES"
          ? 400
          : 500;
    return response(result.code, status);
  }

  return NextResponse.json({
    accepted: true,
    acceptedCount: result.acceptedCount,
    createdCount: result.createdCount,
    existingCount: result.existingCount,
  }, { status: 202, headers: noStoreHeaders });
}

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders });
}

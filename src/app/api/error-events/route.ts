import { NextResponse } from "next/server";
import { getSupabaseConnection } from "@/lib/data/supabase";
import { ingestErrorEvent, isErrorEventPayload, safeSecretEqual } from "@/lib/errors/ingestion";

const maximumPayloadBytes = 128_000;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumPayloadBytes) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return NextResponse.json({ error: "INGEST_NOT_CONFIGURED" }, { status: 503 });

  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const suppliedSecret = request.headers.get("x-kickon-error-secret") ?? "";
  const expectedSecret = process.env.KICKON_ERROR_INGEST_SECRET ?? "";
  let authenticatedUserId: string | null = null;
  let authorized = false;

  if (bearerToken) {
    const { data, error } = await client.auth.getUser(bearerToken);
    if (!error && data.user) {
      authorized = true;
      authenticatedUserId = data.user.id;
    }
  }
  if (!authorized && suppliedSecret && expectedSecret && safeSecretEqual(suppliedSecret, expectedSecret)) authorized = true;
  if (!authorized) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > maximumPayloadBytes) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const body = (() => { try { return JSON.parse(rawBody) as unknown; } catch { return null; } })();
  if (!isErrorEventPayload(body)) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

  const result = await ingestErrorEvent(body, {
    authenticatedUserId,
    requestId: request.headers.get("x-request-id"),
  });
  if (!result.ok) {
    const status = result.code === "INGEST_NOT_CONFIGURED" ? 503 : result.code === "INVALID_ERROR_EVENT" ? 400 : 500;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ accepted: true, groupId: result.groupId }, { status: 202 });
}

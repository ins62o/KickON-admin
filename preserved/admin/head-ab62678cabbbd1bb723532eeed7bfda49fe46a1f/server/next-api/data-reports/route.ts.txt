// Legacy Next.js Route Handler retained for migration to the CloudFront API origin.
import { NextResponse } from "next/server";
import { getSupabaseConnection } from "@/lib/data/supabase";
import { isDataReportPayload, submitDataReport } from "@/lib/reports/ingestion";

const maximumPayloadBytes = 64_000;
const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumPayloadBytes) return response("PAYLOAD_TOO_LARGE", 413);

  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) return response("UNAUTHORIZED", 401);

  const { client, hasServiceRole } = getSupabaseConnection();
  if (!client || !hasServiceRole) return response("SUBMIT_NOT_CONFIGURED", 503);

  const { data, error } = await client.auth.getUser(bearerToken);
  if (error || !data.user) return response("UNAUTHORIZED", 401);

  const rawBody = await request.text().catch(() => "");
  if (Buffer.byteLength(rawBody, "utf8") > maximumPayloadBytes) return response("PAYLOAD_TOO_LARGE", 413);
  const body = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  if (!isDataReportPayload(body)) return response("INVALID_JSON", 400);

  const result = await submitDataReport(data.user.id, body, request.headers.get("x-request-id"));
  if (!result.ok) {
    const status = result.code === "SUBMIT_NOT_CONFIGURED"
      ? 503
      : result.code === "RATE_LIMITED"
        ? 429
        : result.code === "ENTITY_NOT_FOUND"
          ? 404
          : result.code === "INVALID_REPORT"
            ? 400
            : 500;
    return response(result.code, status);
  }

  return NextResponse.json(
    { accepted: true, reportId: result.reportId, created: result.created },
    { status: result.created ? 201 : 200, headers: noStoreHeaders },
  );
}

function response(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStoreHeaders });
}

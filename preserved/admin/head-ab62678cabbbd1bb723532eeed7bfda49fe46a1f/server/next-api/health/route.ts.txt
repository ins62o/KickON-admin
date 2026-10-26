// Legacy Next.js Route Handler retained for migration to the CloudFront API origin.
import { NextResponse } from "next/server";
import { getKickonApiHealth } from "@/lib/health/kickon-api";

export const dynamic = "force-dynamic";

export function GET() {
  const health = getKickonApiHealth();

  return NextResponse.json(
    {
      status: health.status === "normal" ? "ok" : "error",
      service: health.service,
      checkedAt: health.checkedAt,
    },
    {
      status: health.status === "normal" ? 200 : 503,
      headers: {
        "cache-control": "no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

import "server-only";

import { cache } from "react";
import { parseSupabaseProjectMetrics } from "./prometheus-parser";

const MAXIMUM_METRICS_BYTES = 2 * 1024 * 1024;
const METRICS_TIMEOUT_MS = 5_000;

export type SupabaseProjectMetrics = {
  configured: boolean;
  checkedAt: string | null;
  databaseSizeBytes: number | null;
  databaseConnections: number | null;
  databaseMaxConnections: number | null;
  error: string | null;
};

function unavailableMetrics(error: string, configured = false): SupabaseProjectMetrics {
  return {
    configured,
    checkedAt: null,
    databaseSizeBytes: null,
    databaseConnections: null,
    databaseMaxConnections: null,
    error,
  };
}

async function readLimitedResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_METRICS_BYTES) return null;

  if (!response.body) {
    const body = await response.text();
    return Buffer.byteLength(body, "utf8") <= MAXIMUM_METRICS_BYTES ? body : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAXIMUM_METRICS_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export const getSupabaseProjectMetrics = cache(async (): Promise<SupabaseProjectMetrics> => {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = process.env.SUPABASE_METRICS_SECRET_KEY?.trim();

  if (!projectUrl) return unavailableMetrics("Supabase 프로젝트 URL이 설정되지 않았습니다.");
  if (!secretKey) return unavailableMetrics("서버 전용 Metrics Secret API key가 설정되지 않았습니다.");
  if (!secretKey.startsWith("sb_secret_")) {
    return unavailableMetrics("Metrics API에는 sb_secret_ 형식의 Secret API key가 필요합니다.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/customer/v1/privileged/metrics", projectUrl);
  } catch {
    return unavailableMetrics("Supabase 프로젝트 URL 형식이 올바르지 않습니다.");
  }

  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "text/plain",
        Authorization: `Basic ${Buffer.from(`username:${secretKey}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(METRICS_TIMEOUT_MS),
    });
    const checkedAt = new Date().toISOString();

    if (!response.ok) {
      return { ...unavailableMetrics(`Metrics API가 HTTP ${response.status}로 응답했습니다.`, true), checkedAt };
    }

    const body = await readLimitedResponse(response);
    if (body === null) {
      return { ...unavailableMetrics("Metrics API 응답이 허용 크기를 초과했습니다.", true), checkedAt };
    }

    const metrics = parseSupabaseProjectMetrics(body);
    const hasSupportedMetric = metrics.databaseSizeBytes !== null || metrics.databaseConnections !== null;
    return {
      configured: true,
      checkedAt,
      ...metrics,
      error: hasSupportedMetric ? null : "Metrics API 응답에서 지원 지표를 찾지 못했습니다.",
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return unavailableMetrics(timedOut ? "Metrics API 응답 시간이 5초를 초과했습니다." : "Metrics API에 연결할 수 없습니다.", true);
  }
});

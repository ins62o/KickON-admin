"use client";

import { cache } from "react";
import { getPublicSupabaseConfig } from "@/lib/auth/config";
import { getActiveConsoleEnvironment } from "@/lib/environment";
import type { HealthStatus } from "@/lib/data/types";

const HEALTH_TIMEOUT_MS = 4_000;
const MAXIMUM_HEALTH_BODY_BYTES = 16 * 1024;

export type SupabaseServiceProbe = {
  status: HealthStatus;
  detail: string;
  checkedAt: string;
  latencyMs: number | null;
  source: string;
};

function unavailableProbe(detail: string, source: string): SupabaseServiceProbe {
  return {
    status: "unknown",
    detail,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    source,
  };
}

function endpointFor(projectUrl: string, pathname: string) {
  const endpoint = new URL(pathname, projectUrl);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") throw new Error("unsupported protocol");
  return endpoint;
}

function failureDetail(service: string, error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return `${service} Health 응답이 4초를 초과했습니다.`;
  return `${service} Health endpoint에 연결할 수 없습니다.`;
}

async function probeAuth(projectUrl: string, publishableKey: string): Promise<SupabaseServiceProbe> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  try {
    const response = await fetch(endpointFor(projectUrl, "/auth/v1/health"), {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    return {
      status: response.ok ? "normal" : "danger",
      detail: response.ok ? "Auth 서비스 Health 응답 정상" : `Auth Health가 HTTP ${response.status}로 응답했습니다.`,
      checkedAt,
      latencyMs,
      source: "Supabase Auth · /auth/v1/health",
    };
  } catch (error) {
    return { status: "danger", detail: failureDetail("Auth", error), checkedAt, latencyMs: null, source: "Supabase Auth · /auth/v1/health" };
  }
}

async function probeStorage(projectUrl: string, publishableKey: string): Promise<SupabaseServiceProbe> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();
  try {
    const response = await fetch(endpointFor(projectUrl, "/storage/v1/health"), {
      cache: "no-store",
      headers: { Accept: "application/json", apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_HEALTH_BODY_BYTES) {
      return { status: "danger", detail: "Storage Health 응답 크기가 비정상적으로 큽니다.", checkedAt, latencyMs, source: "Supabase Storage · /storage/v1/health" };
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > MAXIMUM_HEALTH_BODY_BYTES) {
      return { status: "danger", detail: "Storage Health 응답 크기가 비정상적으로 큽니다.", checkedAt, latencyMs, source: "Supabase Storage · /storage/v1/health" };
    }
    let healthy = false;
    try {
      const payload = JSON.parse(body) as { healthy?: unknown };
      healthy = payload.healthy === true;
    } catch {
      healthy = false;
    }
    return {
      status: response.ok && healthy ? "normal" : "danger",
      detail: response.ok && healthy
        ? "Storage 서비스와 메타데이터 DB Health 정상"
        : response.ok
          ? "Storage 서비스가 unhealthy 상태를 반환했습니다."
          : `Storage Health가 HTTP ${response.status}로 응답했습니다.`,
      checkedAt,
      latencyMs,
      source: "Supabase Storage · /storage/v1/health",
    };
  } catch (error) {
    return { status: "danger", detail: failureDetail("Storage", error), checkedAt, latencyMs: null, source: "Supabase Storage · /storage/v1/health" };
  }
}

export const getSupabaseServiceHealth = cache(async () => {
  const config = getPublicSupabaseConfig(getActiveConsoleEnvironment());
  if (!config) return {
    auth: unavailableProbe("Supabase URL 또는 Publishable key가 설정되지 않았습니다.", "환경 설정"),
    storage: unavailableProbe("Supabase URL 또는 Publishable key가 설정되지 않았습니다.", "환경 설정"),
  };

  try {
    const [auth, storage] = await Promise.all([
      probeAuth(config.url, config.publishableKey),
      probeStorage(config.url, config.publishableKey),
    ]);
    return { auth, storage };
  } catch {
    return {
      auth: unavailableProbe("Supabase 프로젝트 URL 형식이 올바르지 않습니다.", "환경 설정"),
      storage: unavailableProbe("Supabase 프로젝트 URL 형식이 올바르지 않습니다.", "환경 설정"),
    };
  }
});

import "server-only";

import type { HealthStatus } from "@/lib/data/types";

export type KickonApiHealth = {
  status: HealthStatus;
  service: "kickon-admin";
  detail: string;
  checkedAt: string;
  latencyMs: number;
  source: string;
};

export function getKickonApiHealth(now = new Date()): KickonApiHealth {
  const startedAt = performance.now();
  const checkedAt = now.toISOString();

  return {
    status: "normal",
    service: "kickon-admin",
    detail: "현재 Next.js 서버 요청 처리와 Health 계약이 정상입니다.",
    checkedAt,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    source: "Next.js Route Handler · /api/health",
  };
}

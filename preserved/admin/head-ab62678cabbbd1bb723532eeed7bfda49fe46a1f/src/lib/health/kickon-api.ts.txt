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
    detail: "CloudFront에서 정적 관리자 콘솔이 정상적으로 실행 중입니다.",
    checkedAt,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    source: "S3 + CloudFront static export",
  };
}

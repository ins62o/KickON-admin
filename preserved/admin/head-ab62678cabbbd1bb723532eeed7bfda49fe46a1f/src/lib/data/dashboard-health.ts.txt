import type { Availability, HealthStatus, Metric } from "./types";

const HEALTH_PRIORITY: Record<HealthStatus, number> = {
  danger: 0,
  warning: 1,
  unknown: 2,
  normal: 3,
};

export function deriveDashboardHealth(connection: Availability, metrics: Metric[]) {
  if (connection === "error" || metrics.some((metric) => metric.status === "danger")) {
    return { status: "danger" as const, label: "위험" };
  }
  if (metrics.some((metric) => metric.status === "warning" || metric.availability === "error")) {
    return { status: "warning" as const, label: "주의 필요" };
  }
  if (connection !== "available" || metrics.some((metric) => metric.status === "unknown" || metric.availability !== "available")) {
    return { status: "unknown" as const, label: "일부 확인 불가" };
  }
  return { status: "normal" as const, label: "시스템 정상" };
}

export function compareHealthStatus(a: HealthStatus, b: HealthStatus) {
  return HEALTH_PRIORITY[a] - HEALTH_PRIORITY[b];
}

export function recentSyncHealth(value: string | null): HealthStatus {
  if (!value) return "unknown";
  return Date.now() - new Date(value).getTime() > 60 * 60_000 ? "warning" : "normal";
}

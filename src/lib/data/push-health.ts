import type { HealthStatus } from "./types";

export type PushDeliveryHealthReason =
  | "unavailable"
  | "no-observation"
  | "latest-failure"
  | "stale"
  | "high-failure-rate"
  | "some-failures"
  | "healthy";

export type PushDeliveryHealthInput = {
  connected: boolean;
  latestStatus: "succeeded" | "partial" | "failed" | null;
  latestCompletedAt: string | null;
  runs24h: number;
  delivered24h: number;
  failed24h: number;
  removedTokens24h: number;
};

export type PushDeliveryHealthAssessment = {
  status: HealthStatus;
  reason: PushDeliveryHealthReason;
  attempts24h: number;
  failureRate24h: number | null;
};

export function assessPushDeliveryHealth(input: PushDeliveryHealthInput, now = new Date()): PushDeliveryHealthAssessment {
  const attempts24h = input.delivered24h + input.failed24h;
  const failureRate24h = attempts24h > 0 ? input.failed24h / attempts24h : null;
  const result = (status: HealthStatus, reason: PushDeliveryHealthReason) => ({ status, reason, attempts24h, failureRate24h });

  if (!input.connected) return result("unknown", "unavailable");
  if (!input.latestCompletedAt || !input.latestStatus) return result("unknown", "no-observation");
  if (input.latestStatus === "failed") return result("danger", "latest-failure");
  const latestAt = new Date(input.latestCompletedAt).getTime();
  if (!Number.isFinite(latestAt)) return result("unknown", "no-observation");
  if (Math.max(0, now.getTime() - latestAt) > 7 * 24 * 3_600_000) return result("warning", "stale");
  if (failureRate24h !== null && failureRate24h >= 0.5) return result("danger", "high-failure-rate");
  if (input.latestStatus === "partial" || input.failed24h > 0) return result("warning", "some-failures");
  return result("normal", "healthy");
}

import type { HealthStatus } from "./types";

export type ProviderHealthReason =
  | "unavailable"
  | "no-observation"
  | "stale"
  | "aging"
  | "latest-failure"
  | "high-failure-rate"
  | "some-failures"
  | "healthy";

export type ProviderHealthAssessment = {
  status: HealthStatus;
  reason: ProviderHealthReason;
  requests24h: number;
  failures24h: number;
};

export function assessProviderHealth(input: {
  connected: boolean;
  observedThrough: string | null;
  latestStatusCode: number | null;
  hourly: Array<{ requests: number; failures: number }>;
}, now = new Date()): ProviderHealthAssessment {
  const requests24h = input.hourly.reduce((total, bucket) => total + bucket.requests, 0);
  const failures24h = input.hourly.reduce((total, bucket) => total + bucket.failures, 0);
  const result = (status: HealthStatus, reason: ProviderHealthReason) => ({ status, reason, requests24h, failures24h });

  if (!input.connected) return result("unknown", "unavailable");
  if (!input.observedThrough) return result("unknown", "no-observation");
  const observedAt = new Date(input.observedThrough).getTime();
  if (!Number.isFinite(observedAt)) return result("unknown", "no-observation");
  const ageHours = Math.max(0, now.getTime() - observedAt) / 3_600_000;
  if (ageHours > 48) return result("danger", "stale");
  if (ageHours > 24) return result("warning", "aging");
  if (input.latestStatusCode !== null && (input.latestStatusCode === 429 || input.latestStatusCode >= 500)) {
    return result("danger", "latest-failure");
  }
  if (input.latestStatusCode !== null && input.latestStatusCode >= 400) return result("warning", "latest-failure");
  if (requests24h > 0 && failures24h / requests24h >= 0.5) return result("danger", "high-failure-rate");
  if (failures24h > 0) return result("warning", "some-failures");
  return result("normal", "healthy");
}

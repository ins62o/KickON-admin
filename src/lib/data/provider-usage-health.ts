import type { HealthStatus } from "./types";

export function providerUsageHealth(
  rate: number | null,
  available: boolean,
): HealthStatus {
  if (!available || rate === null) return "unknown";
  if (rate > 75) return "danger";
  if (rate > 50) return "warning";
  return "normal";
}

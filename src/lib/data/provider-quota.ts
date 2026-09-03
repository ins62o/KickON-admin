export type ProviderQuotaObservation = {
  observedAt: string;
  remaining: number | null;
  resetsInSeconds: number | null;
};

export type ProviderQuotaSnapshot = {
  allowance: number | null;
  remaining: number | null;
  resetAt: string | null;
};

function positiveNumber(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegativeNumber(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

export function resolveProviderQuota(
  observation: ProviderQuotaObservation | null,
  configuredAllowance: number | null,
  nowMs = Date.now(),
): ProviderQuotaSnapshot {
  const allowance = positiveNumber(configuredAllowance);
  if (!observation) return { allowance, remaining: null, resetAt: null };

  const remaining = nonNegativeNumber(observation.remaining);
  const observedAtMs = new Date(observation.observedAt).getTime();
  const resetsInSeconds = nonNegativeNumber(observation.resetsInSeconds);
  const resetAtMs = Number.isFinite(observedAtMs) && resetsInSeconds !== null
    ? observedAtMs + resetsInSeconds * 1_000
    : null;

  if (resetAtMs !== null && resetAtMs <= nowMs) {
    return {
      allowance,
      remaining: allowance,
      resetAt: null,
    };
  }

  return {
    allowance,
    remaining,
    resetAt: resetAtMs === null ? null : new Date(resetAtMs).toISOString(),
  };
}

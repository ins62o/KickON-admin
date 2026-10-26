// SportsMonks standing details are counts (played, won, goals…) except goal
// difference, which is legitimately negative for teams conceding more than
// they score. Clamping it to zero stored GD 0 for every such team.
export function readObservedStandingDetailValue(
  raw: unknown,
  options: { signed?: boolean } = {},
): number {
  if (
    typeof raw === 'number' ||
    (typeof raw === 'string' && raw.trim() !== '')
  ) {
    return toStandingDetailValue(Number(raw), {
      ...options,
      requireObserved: true,
    });
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    for (const key of ['total', 'count', 'value', 'all']) {
      const value = readObservedStandingDetailValue(record[key], options);
      if (Number.isFinite(value)) return value;
    }
  }
  return Number.NaN;
}

export function toStandingDetailValue(
  value: number,
  {
    signed = false,
    requireObserved = false,
  }: { signed?: boolean; requireObserved?: boolean } = {},
): number {
  if (requireObserved && (!Number.isInteger(value) || (!signed && value < 0))) {
    return Number.NaN;
  }
  const truncated = Math.trunc(value) + 0;
  return signed ? truncated : Math.max(0, truncated);
}

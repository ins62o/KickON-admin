export function parseProviderPlayerId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  return normalized;
}

export function resolveLineupPlayerIdentity(
  value: unknown,
  isStarter: boolean,
):
  | { status: 'valid'; playerId: string }
  | { status: 'skip' }
  | { status: 'reject' } {
  const playerId = parseProviderPlayerId(value);
  if (playerId) return { status: 'valid', playerId };
  return isStarter ? { status: 'reject' } : { status: 'skip' };
}

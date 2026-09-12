/** Keep provider order while removing duplicate rows for the database key. */
export function deduplicateLineupPlayers<T extends Record<string, unknown>>(
  players: T[],
): T[] {
  const seen = new Set<string>();
  return players.filter(player => {
    const key = JSON.stringify([
      player.fixture_id,
      player.team_id,
      player.player_id,
      player.role,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

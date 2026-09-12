import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { deduplicateLineupPlayers } from './lineupPlayers.ts';

export async function publishFixtureLineup(
  admin: SupabaseClient,
  fixtureId: string,
  lineups: Record<string, unknown>[],
  players: Record<string, unknown>[],
) {
  const uniquePlayers = deduplicateLineupPlayers(players);
  const { error } = await admin.rpc('publish_fixture_lineup', {
    target_fixture_id: fixtureId,
    target_lineups: lineups,
    target_players: uniquePlayers,
  });
  if (error) throw new Error(error.message);
  return {
    players: uniquePlayers.length,
    duplicates: players.length - uniquePlayers.length,
  };
}

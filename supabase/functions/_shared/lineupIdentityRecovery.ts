import { parseProviderPlayerId } from './providerPlayerId.ts';

type LineupMember = {
  player_id: number | null;
  team_id: number;
  jersey_number?: number | null;
  player_name?: string | null;
  type_id?: number | null;
};

export type SeasonSquadMember = {
  player_id: number;
  team_id: number;
  season_id: number;
  jersey_number?: number | null;
  player?: {
    id: number;
    name?: string | null;
    display_name?: string | null;
    common_name?: string | null;
    date_of_birth?: string | null;
  } | null;
};

function normalizeName(value: string | null | undefined) {
  return value?.normalize('NFKC').toLowerCase().replace(/[\s-]+/g, ' ').trim();
}

function matchesName(member: LineupMember, squad: SeasonSquadMember) {
  const name = normalizeName(member.player_name);
  if (!name) return false;
  const player = squad.player;
  if ([player?.name, player?.display_name, player?.common_name]
    .some(value => normalizeName(value) === name)) return true;
  // SportsMonks uses this spelling in the fixture, but a different vowel in its player profile.
  return squad.player_id === 37438802 && player?.date_of_birth === '1999-01-08'
    && normalizeName(player.display_name) === 'ho yeong sung'
    && name === 'ho yeung sung';
}

export async function recoverMissingLineupPlayerIds<T extends LineupMember>(
  seasonId: number | undefined,
  lineups: T[],
  fetchSeasonSquad: (seasonId: number, teamId: number) => Promise<SeasonSquadMember[]>,
): Promise<T[]> {
  if (!Number.isSafeInteger(seasonId) || Number(seasonId) <= 0) return lineups;
  const missing = lineups.filter(member => member.player_id == null);
  if (!missing.length) return lineups;
  const squads = new Map<number, SeasonSquadMember[]>();
  for (const teamId of new Set(missing.map(member => member.team_id))) {
    const squad = await fetchSeasonSquad(seasonId!, teamId);
    if (squad.some(member => member.team_id !== teamId || member.season_id !== seasonId)) {
      throw new Error('PROVIDER_READ: lineup recovery squad scope mismatch');
    }
    squads.set(teamId, squad);
  }
  const usedIds = new Set(lineups.map(member => parseProviderPlayerId(member.player_id)).filter(Boolean));
  return lineups.map(member => {
    if (member.player_id != null || !Number.isSafeInteger(member.jersey_number)
      || Number(member.jersey_number) <= 0 || ![11, 12].includes(member.type_id ?? 0)) return member;
    const squad = squads.get(member.team_id) ?? [];
    const candidates = squad.filter(row => row.jersey_number === member.jersey_number);
    if (candidates.length !== 1) return member;
    const candidate = candidates[0];
    const id = parseProviderPlayerId(candidate.player_id);
    if (!id || parseProviderPlayerId(candidate.player?.id) !== id
      || usedIds.has(id) || squad.filter(row => parseProviderPlayerId(row.player_id) === id).length !== 1
      || !matchesName(member, candidate)) return member;
    usedIds.add(id);
    return { ...member, player_id: candidate.player_id };
  });
}

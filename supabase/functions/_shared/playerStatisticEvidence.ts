export type PlayerStatisticType = {
  name?: string | null;
  developer_name?: string | null;
  code?: string | null;
};

export type PlayerStatisticDetail = {
  type_id: number;
  value: unknown;
  type?: PlayerStatisticType | null;
};

export type PlayerStatisticEvidence =
  | { state: 'observed'; value: number }
  | { state: 'derived_verified'; value: number }
  | { state: 'defaulted'; value: 0 }
  | { state: 'unknown'; value: null };

export type PlayerStatisticEvidenceSet = {
  appearances: PlayerStatisticEvidence;
  goals: PlayerStatisticEvidence;
  assists: PlayerStatisticEvidence;
};

export function isTransferReadyPlayerStatisticEvidence(
  evidence: PlayerStatisticEvidence,
) {
  return (
    evidence.state === 'observed' || evidence.state === 'derived_verified'
  );
}

export function buildPlayerStatisticSnapshotValue(input: {
  teamId: string;
  providerTeamId: number;
  playerId: string;
  season: number;
  leagueId: string;
  statistics: PlayerStatisticEvidenceSet;
}) {
  return {
    team_id: input.teamId,
    provider_team_id: input.providerTeamId,
    player_id: input.playerId,
    season: input.season,
    league_id: input.leagueId,
    statistics: input.statistics,
    projection: {
      appearances: input.statistics.appearances.value ?? 0,
      goals: input.statistics.goals.value ?? 0,
      assists: input.statistics.assists.value ?? 0,
    },
  };
}

function normalizeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function readNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
  }
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['total', 'count', 'value', 'all']) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return readNonNegativeInteger(record[key]);
      }
    }
  }
  return null;
}

export function readPlayerStatisticEvidence(
  details: PlayerStatisticDetail[] | undefined,
  typeId: number,
  developerNames: string[],
): PlayerStatisticEvidence {
  const normalizedNames = developerNames.map(normalizeName);
  const matches = (details ?? []).filter(item => {
    if (item.type_id === typeId) return true;
    const identifiers = [
      item.type?.developer_name,
      item.type?.name,
      item.type?.code,
    ]
      .filter((value): value is string => Boolean(value))
      .map(normalizeName);
    return normalizedNames.some(name => identifiers.includes(name));
  });

  if (!matches.length) return { state: 'defaulted', value: 0 };

  const values = matches.map(item => readNonNegativeInteger(item.value));
  if (values.some(value => value === null)) {
    return { state: 'unknown', value: null };
  }
  const observedValues = new Set(values as number[]);
  if (observedValues.size > 1) {
    throw new Error(`Ambiguous player statistic ${typeId}`);
  }
  return {
    state: 'observed',
    value: observedValues.values().next().value ?? 0,
  };
}

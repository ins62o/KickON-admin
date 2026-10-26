export type FootballLeagueId = 'kleague' | 'kleague2';

export type FootballLeagueConfig = {
  internalLeagueId: FootballLeagueId;
  providerLeagueId: number;
  providerSeasonId: number;
  season: number;
};

const FOOTBALL_LEAGUES: Record<FootballLeagueId, FootballLeagueConfig> = {
  kleague: {
    internalLeagueId: 'kleague',
    providerLeagueId: 1034,
    providerSeasonId: 26894,
    season: 2026,
  },
  kleague2: {
    internalLeagueId: 'kleague2',
    providerLeagueId: 1362,
    providerSeasonId: 27443,
    season: 2026,
  },
};

const PROVIDER_LEAGUE_IDS = new Map<number, FootballLeagueId>([
  [1034, 'kleague'],
  [1362, 'kleague2'],
]);

const PROVIDER_SEASON_IDS: Record<FootballLeagueId, Record<number, number>> = {
  kleague: {
    2024: 23091,
    2025: 25044,
    2026: 26894,
  },
  kleague2: {
    2024: 23131,
    2025: 25074,
    2026: 27443,
  },
};

function toOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    return Number.NaN;
  }
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function resolveFootballLeagueConfig(
  value: unknown,
): FootballLeagueConfig | null {
  const numericLeagueId = toOptionalNumber(value);
  const leagueId =
    numericLeagueId !== null && !Number.isNaN(numericLeagueId)
      ? PROVIDER_LEAGUE_IDS.get(numericLeagueId)
      : typeof value === 'string'
      ? (value.trim() as FootballLeagueId)
      : undefined;
  if (!leagueId) return null;
  return FOOTBALL_LEAGUES[leagueId] ?? null;
}

export function validateFootballLeagueRequest(
  body: Record<string, unknown>,
  options: { allowHistorical?: boolean } = {},
): { config: FootballLeagueConfig } | { error: string } {
  const requestedLeague = body.leagueId ?? 'kleague';
  const config = resolveFootballLeagueConfig(requestedLeague);
  if (!config) return { error: 'Unsupported football league' };

  const suppliedSeason = toOptionalNumber(body.season);
  const suppliedSeasonId = toOptionalNumber(body.seasonId);
  const suppliedProviderLeagueId = toOptionalNumber(body.providerLeagueId);
  const requestedSeason = suppliedSeason ?? config.season;
  const configuredSeasonId = options.allowHistorical
    ? PROVIDER_SEASON_IDS[config.internalLeagueId][requestedSeason]
    : requestedSeason === config.season
    ? config.providerSeasonId
    : undefined;
  if (
    Number.isNaN(suppliedSeason) ||
    Number.isNaN(suppliedSeasonId) ||
    Number.isNaN(suppliedProviderLeagueId) ||
    configuredSeasonId === undefined ||
    (suppliedSeasonId !== null && suppliedSeasonId !== configuredSeasonId) ||
    (suppliedProviderLeagueId !== null &&
      suppliedProviderLeagueId !== config.providerLeagueId)
  ) {
    return {
      error: 'Football league scope does not match the configured season',
    };
  }

  return {
    config: {
      ...config,
      season: requestedSeason,
      providerSeasonId: configuredSeasonId,
    },
  };
}

export function footballSyncKey(
  operation: string,
  config: FootballLeagueConfig,
  suffix?: string,
) {
  const normalizedOperation = operation.trim().replace(/[^a-z0-9-]/gi, '-');
  const normalizedSuffix = suffix?.trim().replace(/[^a-z0-9-]/gi, '-');
  return [
    normalizedOperation,
    String(config.season),
    config.internalLeagueId,
    normalizedSuffix,
  ]
    .filter(Boolean)
    .join(':');
}

export function footballHistorySyncKey(config: FootballLeagueConfig) {
  return footballSyncKey('sportmonks-history', config);
}

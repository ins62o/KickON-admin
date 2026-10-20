export const NONTERMINAL_TRANSFER_CANDIDATE_STATUSES = [
  'candidate',
  'pending_review',
  'approved',
] as const;

export type TransferCandidateProtection = {
  is_protected: true;
  candidate_id: string;
  candidate_status: string;
  candidate_reason: string | null;
  season: number;
  league_id: string;
  player_id: string;
  from_team_id: string;
  to_team_id: string;
};

type CandidateProtectionRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type TransferCandidateProtectionScope = {
  season: number;
  leagueId: string;
  teamId?: string | null;
  playerIds?: string[] | null;
};

export function isNonTerminalTransferCandidateStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    NONTERMINAL_TRANSFER_CANDIDATE_STATUSES.includes(
      status as (typeof NONTERMINAL_TRANSFER_CANDIDATE_STATUSES)[number],
    )
  );
}

function asProtection(value: unknown): TransferCandidateProtection {
  if (!value || typeof value !== 'object') {
    throw new Error('CANDIDATE_PROTECTION: invalid protection row');
  }
  const row = value as Record<string, unknown>;
  if (
    row.is_protected !== true ||
    typeof row.candidate_id !== 'string' ||
    !isNonTerminalTransferCandidateStatus(row.candidate_status) ||
    !Number.isInteger(row.season) ||
    typeof row.league_id !== 'string' ||
    typeof row.player_id !== 'string' ||
    typeof row.from_team_id !== 'string' ||
    typeof row.to_team_id !== 'string'
  ) {
    throw new Error('CANDIDATE_PROTECTION: malformed protection row');
  }
  return row as TransferCandidateProtection;
}

export async function fetchTransferCandidateProtections(
  admin: CandidateProtectionRpcClient,
  scope: TransferCandidateProtectionScope,
): Promise<TransferCandidateProtection[]> {
  const normalizedLeagueId = scope.leagueId.trim();
  const normalizedTeamId = scope.teamId?.trim() || null;
  const normalizedPlayerIds = scope.playerIds
    ? [...new Set(scope.playerIds.map(String).map(value => value.trim()))]
        .filter(value => /^[1-9][0-9]*$/.test(value))
        .sort()
    : null;
  if (!Number.isInteger(scope.season) || scope.season < 2000) {
    throw new Error('CANDIDATE_PROTECTION: invalid season scope');
  }
  if (!normalizedLeagueId) {
    throw new Error('CANDIDATE_PROTECTION: invalid league scope');
  }
  if (
    scope.playerIds &&
    normalizedPlayerIds?.length !== scope.playerIds.length
  ) {
    throw new Error('CANDIDATE_PROTECTION: invalid or duplicate player IDs');
  }
  if (normalizedPlayerIds?.length === 0) return [];

  const { data, error } = await admin.rpc(
    'get_transfer_candidate_protections',
    {
      p_season: scope.season,
      p_league_id: normalizedLeagueId,
      p_team_id: normalizedTeamId,
      p_player_ids: normalizedPlayerIds,
    },
  );
  if (error) {
    throw new Error(
      `CANDIDATE_PROTECTION: ${error.message ?? 'protection lookup failed'}`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error('CANDIDATE_PROTECTION: invalid protection response');
  }

  const protections = data.map(asProtection);
  const seenPlayerIds = new Set<string>();
  for (const protection of protections) {
    if (
      protection.season !== scope.season ||
      protection.league_id !== normalizedLeagueId ||
      (normalizedTeamId &&
        protection.from_team_id !== normalizedTeamId &&
        protection.to_team_id !== normalizedTeamId) ||
      (normalizedPlayerIds &&
        !normalizedPlayerIds.includes(protection.player_id))
    ) {
      throw new Error('CANDIDATE_PROTECTION: out-of-scope protection row');
    }
    if (seenPlayerIds.has(protection.player_id)) {
      throw new Error('CANDIDATE_PROTECTION: duplicate protected player');
    }
    seenPlayerIds.add(protection.player_id);
  }
  return protections;
}

export async function fetchGlobalTransferCandidatePlayerProtections(
  admin: CandidateProtectionRpcClient,
  playerIds: string[],
): Promise<TransferCandidateProtection[]> {
  const normalizedPlayerIds = [
    ...new Set(playerIds.map(String).map(value => value.trim())),
  ]
    .filter(value => /^[1-9][0-9]*$/.test(value))
    .sort();
  if (normalizedPlayerIds.length !== playerIds.length) {
    throw new Error(
      'GLOBAL_LOCALIZATION_PROTECTION: invalid or duplicate player IDs',
    );
  }
  if (normalizedPlayerIds.length === 0) return [];

  const { data, error } = await admin.rpc(
    'get_global_transfer_candidate_player_protections',
    { p_player_ids: normalizedPlayerIds },
  );
  if (error) {
    throw new Error(
      `GLOBAL_LOCALIZATION_PROTECTION: ${
        error.message ?? 'protection lookup failed'
      }`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error(
      'GLOBAL_LOCALIZATION_PROTECTION: invalid protection response',
    );
  }

  const protections = data.map(asProtection);
  const seenPlayerIds = new Set<string>();
  for (const protection of protections) {
    if (!normalizedPlayerIds.includes(protection.player_id)) {
      throw new Error(
        'GLOBAL_LOCALIZATION_PROTECTION: out-of-scope protection row',
      );
    }
    if (seenPlayerIds.has(protection.player_id)) {
      throw new Error(
        'GLOBAL_LOCALIZATION_PROTECTION: duplicate protected player',
      );
    }
    seenPlayerIds.add(protection.player_id);
  }
  return protections;
}

export function partitionCandidateProtectedRows<T>(
  rows: readonly T[],
  protectedPlayerIds: ReadonlySet<string>,
  getPlayerId: (row: T) => unknown,
) {
  const eligible: T[] = [];
  const protectedRows: T[] = [];
  for (const row of rows) {
    const playerId = String(getPlayerId(row) ?? '').trim();
    if (protectedPlayerIds.has(playerId)) protectedRows.push(row);
    else eligible.push(row);
  }
  return { eligible, protected: protectedRows };
}

type CandidateQuarantineTelemetryInput = {
  quarantineCount?: number;
  globalLocalizationProtectedCount?: number;
  projectionSkipped?: number;
  membershipSkipped?: number;
  scoringSkipped?: number;
  localizationSkipped?: number;
  projectionCreated?: number;
  projectionUpdated?: number;
  projectionInactivated?: number;
  membershipOpened?: number;
  membershipClosed?: number;
  scoringCreated?: number;
  scoringUpdated?: number;
  scoringDeleted?: number;
  localizationCreated?: number;
  localizationUpdated?: number;
};

export function buildCandidateQuarantineTelemetry(
  input: CandidateQuarantineTelemetryInput = {},
) {
  return {
    quarantine_count: input.quarantineCount ?? 0,
    global_localization_protected_count:
      input.globalLocalizationProtectedCount ?? 0,
    quarantine_projection_skipped: input.projectionSkipped ?? 0,
    quarantine_membership_skipped: input.membershipSkipped ?? 0,
    quarantine_scoring_skipped: input.scoringSkipped ?? 0,
    quarantine_localization_skipped: input.localizationSkipped ?? 0,
    projection_created: input.projectionCreated ?? 0,
    projection_updated: input.projectionUpdated ?? 0,
    projection_inactivated: input.projectionInactivated ?? 0,
    membership_opened: input.membershipOpened ?? 0,
    membership_closed: input.membershipClosed ?? 0,
    scoring_created: input.scoringCreated ?? 0,
    scoring_updated: input.scoringUpdated ?? 0,
    scoring_deleted: input.scoringDeleted ?? 0,
    localization_created: input.localizationCreated ?? 0,
    localization_updated: input.localizationUpdated ?? 0,
  };
}

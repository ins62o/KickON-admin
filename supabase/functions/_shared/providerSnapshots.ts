import { type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { type FootballLeagueConfig } from './footballLeagueConfig.ts';
import {
  buildPlayerStatisticSnapshotValue,
  type PlayerStatisticEvidenceSet,
} from './playerStatisticEvidence.ts';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter(key => record[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export type PlayerProviderSnapshotInput = {
  config: FootballLeagueConfig;
  teamId: string;
  providerTeamId: number;
  playerId: string;
  requestId: string;
  endpoint: string;
  rawPayload: Record<string, unknown>;
  statistics: PlayerStatisticEvidenceSet;
  fetchedAt: string;
  syncRunId?: string | null;
};

export async function persistPlayerProviderSnapshot(
  admin: SupabaseClient,
  input: PlayerProviderSnapshotInput,
) {
  const comparableValue = buildPlayerStatisticSnapshotValue({
    teamId: input.teamId,
    providerTeamId: input.providerTeamId,
    playerId: input.playerId,
    season: input.config.season,
    leagueId: input.config.internalLeagueId,
    statistics: input.statistics,
  });
  const snapshotHash = await sha256(
    stableJson({ rawPayload: input.rawPayload, comparableValue }),
  );
  const { data, error } = await admin.rpc('ingest_provider_entity_snapshot', {
    p_provider: 'sportmonks',
    p_entity_type: 'player',
    p_entity_id: `${input.config.internalLeagueId}:${input.teamId}:${input.playerId}`,
    p_provider_entity_id: input.playerId,
    p_season: input.config.season,
    p_league_id: input.config.internalLeagueId,
    p_source_endpoint: input.endpoint,
    p_raw_payload: input.rawPayload,
    p_comparable_value: comparableValue,
    p_snapshot_hash: snapshotHash,
    p_fetched_at: input.fetchedAt,
    p_request_id: input.requestId,
    p_sync_run_id: input.syncRunId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export type TeamSquadProviderSnapshotInput = {
  config: FootballLeagueConfig;
  teamId: string;
  providerTeamId: string;
  requestId: string;
  endpoint: string;
  rawPayload: Record<string, unknown>[];
  activePlayerIds: string[];
  inactivePlayerIds: string[];
  fetchedAt: string;
  syncRunId?: string | null;
};

export async function persistTeamSquadProviderSnapshot(
  admin: SupabaseClient,
  input: TeamSquadProviderSnapshotInput,
) {
  const comparableValue = {
    team_id: input.teamId,
    active_player_ids: [...input.activePlayerIds].sort(),
    inactive_player_ids: [...input.inactivePlayerIds].sort(),
  };
  const snapshotHash = await sha256(
    stableJson({ rawPayload: input.rawPayload, comparableValue }),
  );
  const { data, error } = await admin.rpc('ingest_provider_entity_snapshot', {
    p_provider: 'sportmonks',
    p_entity_type: 'team_squad',
    p_entity_id: `${input.config.internalLeagueId}:${input.teamId}:current`,
    p_provider_entity_id: input.providerTeamId,
    p_season: input.config.season,
    p_league_id: input.config.internalLeagueId,
    p_source_endpoint: input.endpoint,
    p_raw_payload: input.rawPayload,
    p_comparable_value: comparableValue,
    p_snapshot_hash: snapshotHash,
    p_fetched_at: input.fetchedAt,
    p_request_id: input.requestId,
    p_sync_run_id: input.syncRunId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function persistFixtureEventStatisticEvidence(
  admin: SupabaseClient,
  input: {
    fixturePackages: Array<Record<string, unknown>>;
    playerEvidence: Record<string, unknown>;
  },
) {
  const { data, error } = await admin.rpc(
    'persist_fixture_event_stat_evidence',
    {
      p_fixture_packages: input.fixturePackages,
      p_player_evidence: input.playerEvidence,
    },
  );
  if (error) throw error;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Fixture statistic persistence returned an invalid result');
  }
  return data as Record<string, unknown>;
}

import { CURRENT_SEASON, type LeagueFilter } from "@/lib/football/config";
import { cache } from "react";
import { fetchAllRows } from "./pagination";

import { formatRelativeTime } from "@/lib/format";
import {
  cronSyncOperation,
  getSyncOperation,
  syncOperations,
  type SyncOperation,
  type SyncOperationLastSyncMap,
} from "@/lib/sync/catalog";
import { getOperationsClient } from "./operations-client";

type SyncRunHistoryRow = {
  job_key: string;
  finished_at: string | null;
  metadata: unknown;
};

type SyncStateHistoryRow = {
  sync_key: string;
  season?: number | null;
  league_id?: string | null;
  last_succeeded_at: string | null;
};

const syncStateOperation: Record<string, SyncOperation> = {
  "sportmonks-live": "live",
  [`sportmonks-post-match-${CURRENT_SEASON}`]: "post-match",
  [`sportmonks-history-2024-${CURRENT_SEASON}`]: "history-backfill",
  [`team-metrics-${CURRENT_SEASON}-v2`]: "team-metrics",
};

function operationFromSyncState(scopedKey: string) {
  const syncKey = scopedKey.replace(/:\d{4}:kleague2?$/, "");
  if (syncKey.startsWith(`team-squad-${CURRENT_SEASON}-`)) return "team-squad";
  return syncStateOperation[syncKey] ?? null;
}

function operationFromMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const operationKey = (value as Record<string, unknown>).operationKey;
  return typeof operationKey === "string" ? getSyncOperation(operationKey)?.key ?? null : null;
}

function operationFromRun(row: SyncRunHistoryRow) {
  const metadataOperation = operationFromMetadata(row.metadata);
  if (metadataOperation) return metadataOperation;

  const cronOperation = cronSyncOperation[row.job_key];
  if (cronOperation) return cronOperation;

  const directOperations = syncOperations.filter((operation) => operation.functionName === row.job_key);
  if (directOperations.length === 1) return directOperations[0].key;
  return row.job_key === "sync-football-data" ? "full" : null;
}

function latestTimestamp(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export const getSyncOperationHistory = cache(async (league: LeagueFilter = "all"): Promise<SyncOperationLastSyncMap> => {
  const client = await getOperationsClient();
  if (!client) {
    return Object.fromEntries(syncOperations.map((operation) => [
      operation.key,
      { at: null, label: "확인 불가" },
    ])) as SyncOperationLastSyncMap;
  }

  let runsQuery = client.from("sync_runs").select("job_key,finished_at,metadata")
    .in("status", ["succeeded", "partial"]).not("finished_at", "is", null);
  if (league !== "all") runsQuery = runsQuery.contains("metadata", { leagueId: league, season: CURRENT_SEASON });
  const [runsResult, statesResult] = await Promise.all([
    runsQuery.order("finished_at", { ascending: false }).order("id").limit(200),
    fetchAllRows((from, to) => client.from("football_sync_state").select("*")
      .not("last_succeeded_at", "is", null).order("sync_key").range(from, to)),
  ]);

  const timestamps = Object.fromEntries(
    syncOperations.map((operation) => [operation.key, null]),
  ) as Record<SyncOperation, string | null>;
  const available = Object.fromEntries(
    syncOperations.map((operation) => [operation.key, !runsResult.error]),
  ) as Record<SyncOperation, boolean>;

  if (!runsResult.error) {
    for (const row of (runsResult.data ?? []) as SyncRunHistoryRow[]) {
      if (league !== "all" && (row.metadata as Record<string, unknown> | null)?.leagueId !== league) continue;
      const operation = operationFromRun(row);
      if (operation) timestamps[operation] = latestTimestamp(timestamps[operation], row.finished_at);
    }
  }

  if (!statesResult.error) {
    for (const operation of [...Object.values(syncStateOperation), "team-squad" as const]) {
      available[operation] = true;
    }
    for (const row of (statesResult.data ?? []) as SyncStateHistoryRow[]) {
      if (league !== "all" && (row.league_id !== league || row.season !== CURRENT_SEASON)) continue;
      const operation = operationFromSyncState(row.sync_key);
      if (!operation) continue;
      available[operation] = true;
      timestamps[operation] = latestTimestamp(timestamps[operation], row.last_succeeded_at);
    }
  }

  return Object.fromEntries(syncOperations.map((operation) => {
    const at = timestamps[operation.key];
    return [
      operation.key,
      {
        at,
        label: available[operation.key]
          ? at ? formatRelativeTime(at) : "기록 없음"
          : "확인 불가",
      },
    ];
  })) as SyncOperationLastSyncMap;
});

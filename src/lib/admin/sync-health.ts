export type RecentSyncRunRow = {
  job_key: string;
  status: string;
  failed_count: number | null;
  error_code: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
};

function syncRunScope(row: RecentSyncRunRow) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  return [
    row.job_key,
    String(metadata.operationKey ?? ""),
    String(metadata.leagueId ?? "all"),
    String(metadata.season ?? ""),
  ].join(":");
}

export function countUnrecoveredSyncFailures(rows: RecentSyncRunRow[]) {
  const latestSuccess = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "succeeded") continue;
    const timestamp = Date.parse(row.created_at);
    const current = latestSuccess.get(syncRunScope(row));
    if (Number.isFinite(timestamp) && (current === undefined || timestamp > current)) {
      latestSuccess.set(syncRunScope(row), timestamp);
    }
  }
  return rows.filter((row) => {
    const failed = row.status === "failed" || (
      row.status === "partial" && (
        (row.failed_count ?? 0) > 0 || Boolean(row.error_code?.trim()) || Boolean(row.error_message?.trim())
      )
    );
    if (!failed) return false;
    const recoveredAt = latestSuccess.get(syncRunScope(row));
    return recoveredAt === undefined || recoveredAt <= Date.parse(row.created_at);
  }).length;
}

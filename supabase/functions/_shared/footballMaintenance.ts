type Client = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{data: unknown; error: unknown}> };
type Config = { internalLeagueId: string; season: number };
type Outcome = 'SUCCESS' | 'RETRY' | 'BLOCKED';
function message(error: unknown): string {
  return error instanceof Error ? error.message : String((error as {message?: unknown})?.message ?? error);
}
export function maintenanceFailureResult(error: unknown): 'RETRY' | 'BLOCKED' {
  return /CRON46_BLOCKED:|CRON46_SCOPE_INVALID|CRON46_VERSIONED_RESULT_REQUIRED|VERSIONED_FIXTURE_WRITE_REQUIRED|FIXTURE_METADATA_INPUT|FIXTURE_METADATA_DUPLICATE/.test(message(error)) ? 'BLOCKED' : 'RETRY';
}
export function withExpectedFixtureRows(rows: Record<string, unknown>[], snapshots: Record<string, unknown>[]) {
  const byId = new Map(snapshots.map(row => [String(row.id), row]));
  if (byId.size !== snapshots.length) throw new Error('CRON46_BLOCKED:DUPLICATE_SNAPSHOT');
  return rows.map(row => ({...row, _expected: byId.get(String(row.id)) ?? null}));
}

class FootballMaintenanceRun {
  private client: Client;
  private args: Record<string, unknown>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private renewing: Promise<boolean> | null = null;
  private lost = false;
  private closed = false;
  private finalizationAttempted = false;
  constructor(client: Client, config: Config, owner: string, generation: number) {
    this.client = client;
    this.args = {p_league: config.internalLeagueId, p_season: config.season, p_owner: owner, p_generation: generation};
    this.timer = setInterval(() => { void this.renewNow(); }, 20_000);
  }
  get canRecordFailure() { return !this.closed && !this.lost && !this.finalizationAttempted; }
  assertAlive() {
    if (this.lost || this.closed) throw new Error('CRON46_LEASE_LOST');
  }
  renewNow(): Promise<boolean> {
    if (this.renewing) return this.renewing;
    if (this.closed || this.finalizationAttempted) return Promise.resolve(false);
    this.renewing = (async () => {
      try {
        const {data, error} = await this.client.rpc('renew_football_maintenance_v1', this.args);
        if (error || data !== true) this.lost = true;
      } catch { this.lost = true; }
      return !this.lost;
    })().finally(() => { this.renewing = null; });
    return this.renewing;
  }
  async apply(rows: Record<string, unknown>[], snapshots: Record<string, unknown>[]) {
    this.assertAlive();
    const payload = {...this.args, p_rows: withExpectedFixtureRows(rows, snapshots)};
    let result: {data: unknown; error: unknown};
    try { result = await this.client.rpc('apply_football_maintenance_rows_v1', payload); }
    catch (cause) {
      this.lost = true;
      throw new Error('CRON46_APPLY_OUTCOME_UNKNOWN: ' + message(cause));
    }
    const {data, error} = result;
    if (error) {
      if (!(error as {code?: string}).code) {
        this.lost = true;
        throw new Error('CRON46_APPLY_OUTCOME_UNKNOWN: ' + message(error));
      }
      throw new Error(message(error));
    }
    if (data !== rows.length) throw new Error('CRON46_ROW_COUNT_MISMATCH');
    this.assertAlive();
  }
  async finish(outcome: Outcome, error?: unknown) {
    if (this.finalizationAttempted) throw new Error('CRON46_FINALIZATION_ALREADY_ATTEMPTED');
    await this.pauseHeartbeat();
    this.assertAlive();
    // A lost COMMIT response must never trigger a second completion request.
    this.finalizationAttempted = true;
    try {
      const {data, error: rpcError} = await this.client.rpc('complete_football_maintenance_v1', {...this.args, p_result: outcome, p_error: error == null ? null : message(error).slice(0, 1000)});
      if (rpcError || (data as {status?: string})?.status !== (outcome === 'SUCCESS' ? 'SUCCEEDED' : outcome)) {
        throw new Error(message(rpcError ?? 'INVALID_COMPLETION_RECEIPT'));
      }
    } catch (cause) { throw new Error('CRON46_COMPLETE_OUTCOME_UNKNOWN: ' + message(cause)); }
    finally { this.closed = true; }
  }
  private async pauseHeartbeat() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.renewing) await this.renewing;
  }
  async stop() { await this.pauseHeartbeat(); this.closed = true; }
}

export async function beginFootballMaintenance(client: Client, kind: 'history' | 'post_match', config: Config, owner = crypto.randomUUID()): Promise<{run: FootballMaintenanceRun | null; status: string}> {
  const {data, error} = await client.rpc('claim_football_maintenance_v1', {p_kind: kind, p_league: config.internalLeagueId, p_season: config.season, p_owner: owner});
  if (error) throw new Error(message(error));
  const result = data as {status?: string; generation?: number};
  if (['BUSY', 'COMPLETE', 'RETRY_WAIT', 'BLOCKED', 'LEGACY_RUNNING_UNKNOWN'].includes(result?.status ?? '')) return {run: null, status: result.status!};
  if (result?.status !== 'CLAIMED' || !Number.isSafeInteger(result.generation) || result.generation! < 1) throw new Error('CRON46_INVALID_CLAIM_RECEIPT');
  return {run: new FootballMaintenanceRun(client, config, owner, result.generation!), status: 'CLAIMED'};
}

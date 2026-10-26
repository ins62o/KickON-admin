const PROJECT_METRIC_NAMES = new Set([
  "connection_stats_connection_count",
  "max_connections_connection_count",
  "pg_database_size_bytes",
  "pg_database_size_mb",
]);

type ParsedMetric = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

export type ParsedSupabaseProjectMetrics = {
  databaseSizeBytes: number | null;
  databaseConnections: number | null;
  databaseMaxConnections: number | null;
};

function parseLabels(input: string | undefined) {
  const labels: Record<string, string> = {};
  if (!input) return labels;

  const labelPattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g;
  for (const match of input.matchAll(labelPattern)) {
    labels[match[1]] = match[2].replace(/\\([\\"n])/g, (_, value: string) => value === "n" ? "\n" : value);
  }
  return labels;
}

export function parseSupabaseProjectMetrics(input: string): ParsedSupabaseProjectMetrics {
  const metrics: ParsedMetric[] = [];
  const samplePattern = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(?:\s+\d+)?$/;

  for (const line of input.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(samplePattern);
    if (!match || !PROJECT_METRIC_NAMES.has(match[1])) continue;
    const value = Number(match[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    metrics.push({ name: match[1], labels: parseLabels(match[2]), value });
  }

  const databaseSizeMb = metrics.find((metric) => metric.name === "pg_database_size_mb")?.value ?? null;
  const databaseSizeSamples = metrics.filter((metric) => metric.name === "pg_database_size_bytes");
  const databaseSizeBytes = databaseSizeSamples.length > 0
    ? databaseSizeSamples.reduce((total, metric) => total + metric.value, 0)
    : null;
  const connectionSamples = metrics.filter((metric) => metric.name === "connection_stats_connection_count");
  const maximumConnections = metrics.find((metric) => metric.name === "max_connections_connection_count")?.value ?? null;

  return {
    databaseSizeBytes: databaseSizeMb === null ? databaseSizeBytes : databaseSizeMb * 1024 * 1024,
    databaseConnections: connectionSamples.length > 0
      ? connectionSamples.reduce((total, metric) => total + metric.value, 0)
      : null,
    databaseMaxConnections: maximumConnections,
  };
}

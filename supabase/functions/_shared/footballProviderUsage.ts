import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type FootballRateLimit = {
  requested_entity?: string;
  remaining?: number | string;
  resets_in_seconds?: number | string;
};

function toInteger(value: number | string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export async function recordFootballProviderUsage(
  admin: SupabaseClient,
  input: {
    source: string;
    endpoint: string;
    statusCode: number;
    rateLimit?: FootballRateLimit;
  },
) {
  await admin
    .from('football_provider_usage')
    .insert({
      source: input.source,
      endpoint: input.endpoint,
      requested_entity: input.rateLimit?.requested_entity ?? null,
      remaining: toInteger(input.rateLimit?.remaining),
      resets_in_seconds: toInteger(input.rateLimit?.resets_in_seconds),
      status_code: input.statusCode,
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

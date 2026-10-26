"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getActiveConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";

export type SupabaseConnection = {
  client: SupabaseClient | null;
  hasServiceRole: boolean;
  environment: "development" | "production";
};

export function getSupabaseConnection(
  environment: ConsoleEnvironment = getActiveConsoleEnvironment(),
): SupabaseConnection {
  const client = getBrowserSupabaseClient(environment);

  return {
    client,
    hasServiceRole: false,
    environment,
  };
}

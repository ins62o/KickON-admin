"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/auth/config";
import { getActiveConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";

const browserClients = new Map<ConsoleEnvironment, SupabaseClient>();

export function getBrowserSupabaseClient(environment: ConsoleEnvironment = getActiveConsoleEnvironment()) {
  const existing = browserClients.get(environment);
  if (existing) return existing;

  const config = getPublicSupabaseConfig(environment);
  if (!config) return null;

  const client = createBrowserClient(config.url, config.publishableKey, {
    // This module caches one client per environment. The SSR library's default
    // browser singleton would reuse the first environment's URL and session.
    isSingleton: false,
    auth: {
      storageKey: `kickon-admin-auth-${environment}`,
    },
  });
  browserClients.set(environment, client);
  return client;
}

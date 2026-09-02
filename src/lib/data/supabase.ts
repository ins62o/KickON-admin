import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseConnection = {
  client: SupabaseClient | null;
  hasServiceRole: boolean;
  environment: "development" | "production";
};

export function getSupabaseConnection(): SupabaseConnection {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const environment = process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development";
  const key = serviceRoleKey || publishableKey;

  if (!url || !key) return { client: null, hasServiceRole: false, environment };

  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    hasServiceRole: Boolean(serviceRoleKey),
    environment,
  };
}

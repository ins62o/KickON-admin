import type { ConsoleEnvironment } from "@/lib/environment";

export function isAdminAuthRequired() {
  if (process.env.KICKON_ENVIRONMENT === "production") return true;
  return process.env.KICKON_ADMIN_AUTH_REQUIRED === "true";
}

export function getPublicSupabaseConfig(environment: ConsoleEnvironment = process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT === "production" ? "production" : "development") {
  const scopedConfig = environment === "production"
    ? {
        url: process.env.NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL,
        publishableKey: process.env.NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY,
      }
    : {
        url: process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL,
        publishableKey: process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY,
      };
  const url = scopedConfig.url ?? (environment === (process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT === "production" ? "production" : "development") ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined);
  const publishableKey = scopedConfig.publishableKey ?? (environment === (process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT === "production" ? "production" : "development") ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined);

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function isAdminAuthRequired() {
  if (process.env.KICKON_ENVIRONMENT === "production") return true;
  return process.env.KICKON_ADMIN_AUTH_REQUIRED === "true";
}

export function getPublicSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

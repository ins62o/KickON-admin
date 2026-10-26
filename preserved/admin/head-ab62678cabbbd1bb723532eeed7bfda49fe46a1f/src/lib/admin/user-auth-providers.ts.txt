import type { SupabaseClient } from "@supabase/supabase-js";

type AuthProviderRow = {
  user_id: string;
  auth_provider: string | null;
};

export async function loadUserAuthProviders(client: SupabaseClient) {
  const providers = new Map<string, string>();
  const pageSize = 500;

  for (let offset = 0; ; offset += pageSize) {
    const result = await client.rpc("admin_get_user_auth_providers")
      .order("user_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) return new Map<string, string>();

    const rows = (result.data ?? []) as AuthProviderRow[];
    for (const row of rows) {
      if (typeof row.user_id === "string" && typeof row.auth_provider === "string") {
        providers.set(row.user_id, row.auth_provider);
      }
    }
    if (rows.length < pageSize) return providers;
  }
}

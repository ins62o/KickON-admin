import "server-only";

import { createAuthServerClient } from "@/lib/auth/server";
import { isAdminAuthRequired } from "@/lib/auth/config";
import { getSupabaseConnection } from "./supabase";

export async function getOperationsClient() {
  if (isAdminAuthRequired()) return createAuthServerClient();
  return getSupabaseConnection().client;
}

export function isOperationsSchemaMissing(code?: string) {
  return code === "42P01" || code === "PGRST205" || code === "PGRST204" || code === "PGRST202" || code === "42883";
}

import { getSupabaseConnection } from "./supabase";
import type { ConsoleEnvironment } from "@/lib/environment";

export async function getOperationsClient(environment?: ConsoleEnvironment) {
  return getSupabaseConnection(environment).client;
}

export function isOperationsSchemaMissing(code?: string) {
  return code === "42P01" || code === "PGRST205" || code === "PGRST204" || code === "PGRST202" || code === "42883";
}

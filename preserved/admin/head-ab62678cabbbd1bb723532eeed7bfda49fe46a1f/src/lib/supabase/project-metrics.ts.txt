"use client";

import { callAdminApi } from "@/lib/admin-api";
import type { ConsoleEnvironment } from "@/lib/environment";

export type SupabaseProjectMetrics = {
  configured: boolean;
  checkedAt: string | null;
  databaseSizeBytes: number | null;
  databaseConnections: number | null;
  databaseMaxConnections: number | null;
  databaseLimitBytes: number | null;
  providerAllowance: number | null;
  databaseSizeSource?: "metrics-api" | "database-rpc" | null;
  detailsError?: string | null;
  error: string | null;
};

function unavailableMetrics(error: string): SupabaseProjectMetrics {
  return {
    configured: false,
    checkedAt: null,
    databaseSizeBytes: null,
    databaseConnections: null,
    databaseMaxConnections: null,
    databaseLimitBytes: null,
    providerAllowance: null,
    databaseSizeSource: null,
    detailsError: error,
    error,
  };
}

export async function getSupabaseProjectMetrics(
  environment?: ConsoleEnvironment,
): Promise<SupabaseProjectMetrics> {
  try {
    return await callAdminApi<SupabaseProjectMetrics>("/admin/usage/metrics", {}, environment);
  } catch (error) {
    return unavailableMetrics(error instanceof Error
      ? error.message
      : "관리자 API에서 DB 사용량을 확인할 수 없습니다.");
  }
}

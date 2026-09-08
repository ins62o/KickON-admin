"use client";

import { callAdminAction } from "@/lib/admin-api";
import { invalidateAdminData } from "@/lib/client-data";

export type SyncActionState = {
  status: "idle" | "success" | "warning" | "error";
  message: string | null;
  operation: string | null;
  completedAt: string | null;
};

type SyncActionResponse = {
  status?: SyncActionState["status"];
  message?: string | null;
  operation?: string | null;
  completedAt?: string | null;
};

const SYNC_ACTION_TIMEOUT_MS = 58_000;

export async function runSyncAction(
  _previous: SyncActionState,
  formData: FormData,
): Promise<SyncActionState> {
  const operation = String(formData.get("operation") ?? "") || null;

  try {
    const result = await callAdminAction<SyncActionResponse>(
      "runSync",
      formData,
      SYNC_ACTION_TIMEOUT_MS,
    );
    const state: SyncActionState = {
      status: result.status && result.status !== "idle" ? result.status : "success",
      message: result.message ?? "동기화 요청을 완료했습니다.",
      operation: result.operation ?? operation,
      completedAt: result.completedAt ?? new Date().toISOString(),
    };
    invalidateAdminData();
    return state;
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "동기화 요청을 실행하지 못했습니다.",
      operation,
      completedAt: null,
    };
  }
}

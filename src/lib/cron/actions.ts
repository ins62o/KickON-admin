"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient, requireAdmin } from "@/lib/auth/server";
import { sanitizeErrorText } from "@/lib/errors/ingestion";
import { cronMaintenanceJobs, isCronMaintenanceJobKey } from "./catalog";

export type CronMaintenanceActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  jobKey: string | null;
  runId: string | null;
};

export async function runCronMaintenanceAction(_previous: CronMaintenanceActionState, formData: FormData): Promise<CronMaintenanceActionState> {
  const admin = await requireAdmin();
  const jobKey = String(formData.get("jobKey") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!isCronMaintenanceJobKey(jobKey)) return { status: "error", message: "허용되지 않은 보관 정리 작업입니다.", jobKey, runId: null };
  if (admin.isDevelopmentBypass || !admin.userId) return { status: "error", message: "인증 우회 상태에서는 보관 데이터를 삭제할 수 없습니다.", jobKey, runId: null };
  if (admin.role !== "admin" && admin.role !== "super_admin") return { status: "error", message: "보관 정리에는 관리자 이상의 권한이 필요합니다.", jobKey, runId: null };
  if (reason.length < 3 || reason.length > 500) return { status: "error", message: "실행 이유를 3자 이상 500자 이하로 입력해 주세요.", jobKey, runId: null };

  const supabase = await createAuthServerClient();
  if (!supabase) return { status: "error", message: "운영 데이터 연결 설정이 없습니다.", jobKey, runId: null };

  const startedAt = new Date().toISOString();
  const runResult = await supabase.from("sync_runs").insert({
    job_key: jobKey,
    target_type: "retention",
    target_id: null,
    trigger_type: "manual",
    environment: process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development",
    status: "running",
    requested_by: admin.userId,
    reason,
    started_at: startedAt,
  }).select("id").maybeSingle();
  const runId = runResult.data?.id ? String(runResult.data.id) : null;
  if (runResult.error || !runId) {
    return { status: "error", message: "실행 기록을 만들지 못해 보관 정리를 시작하지 않았습니다.", jobKey, runId: null };
  }

  const cleanup = await supabase.rpc("run_admin_retention_cleanup", { p_job_key: jobKey, p_reason: reason });
  const finishedAt = new Date().toISOString();
  if (cleanup.error) {
    const message = sanitizeErrorText(cleanup.error.message) || "보관 정리 작업을 실행하지 못했습니다.";
    await supabase.from("sync_runs").update({
      status: "failed",
      finished_at: finishedAt,
      failed_count: 1,
      error_code: cleanup.error.code ?? "RETENTION_CLEANUP_FAILED",
      error_message: message,
      metadata: { action: "retention-cleanup" },
    }).eq("id", runId);
    revalidatePath("/cron");
    revalidatePath("/sync-history");
    return { status: "error", message: "보관 정리에 실패했습니다. 실행 기록에서 원인을 확인해 주세요.", jobKey, runId };
  }

  const row = cleanup.data?.[0] as { deleted_count?: unknown; cutoff_at?: unknown } | undefined;
  const parsedDeletedCount = Number(row?.deleted_count ?? 0);
  const deletedCount = Number.isFinite(parsedDeletedCount) ? Math.max(0, parsedDeletedCount) : 0;
  const cutoffAt = typeof row?.cutoff_at === "string" ? row.cutoff_at : null;
  const finalization = await supabase.from("sync_runs").update({
    status: "succeeded",
    finished_at: finishedAt,
    metadata: { action: "retention-cleanup", deletedCount, cutoffAt },
  }).eq("id", runId);

  revalidatePath("/cron");
  revalidatePath("/sync-history");
  revalidatePath("/audit");
  return finalization.error
    ? { status: "error", message: `${deletedCount.toLocaleString("ko-KR")}건을 삭제했지만 실행 기록을 마무리하지 못했습니다. 중복 실행하지 말고 실행 기록을 확인해 주세요.`, jobKey, runId }
    : { status: "success", message: `${cronMaintenanceJobs[jobKey].target} ${deletedCount.toLocaleString("ko-KR")}건을 삭제했습니다.`, jobKey, runId };
}

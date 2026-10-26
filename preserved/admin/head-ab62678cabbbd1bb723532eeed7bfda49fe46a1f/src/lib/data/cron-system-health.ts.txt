import type { HealthStatus } from "./types";

type CronHealthJob = {
  active: boolean | null;
  status: HealthStatus;
  source: "pg_cron" | "migration";
};

export function assessCronSystemHealth(runtimeConnected: boolean, jobs: CronHealthJob[]) {
  const activeRuntimeJobs = jobs.filter((job) => job.source === "pg_cron" && job.active !== false);
  if (!runtimeConnected || activeRuntimeJobs.length === 0) {
    return { status: "unknown" as const, detail: "pg_cron 런타임 결과를 확인할 수 없습니다." };
  }
  const failures = activeRuntimeJobs.filter((job) => job.status === "danger").length;
  if (failures > 0) return { status: "danger" as const, detail: `활성 작업 ${activeRuntimeJobs.length}개 중 ${failures}개 실패` };
  const warnings = activeRuntimeJobs.filter((job) => job.status === "warning").length;
  if (warnings > 0) return { status: "warning" as const, detail: `활성 작업 ${activeRuntimeJobs.length}개 중 ${warnings}개 지연 또는 실행 중` };
  if (activeRuntimeJobs.every((job) => job.status === "normal")) {
    return { status: "normal" as const, detail: `활성 작업 ${activeRuntimeJobs.length}개의 최근 실행 정상` };
  }
  return { status: "unknown" as const, detail: `활성 작업 ${activeRuntimeJobs.length}개 중 결과 미확인 작업이 있습니다.` };
}

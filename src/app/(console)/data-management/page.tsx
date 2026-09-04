"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, CircleAlert, Database, HardDrive, RefreshCcw } from "lucide-react";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { PageHeader } from "@/components/admin/page-header";
import { CompactUsageGauge } from "@/components/dashboard/compact-usage-gauge";
import { SyncControl } from "@/components/sync/sync-control";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getAuditLogList } from "@/lib/data/audit";
import { getDashboardUsageSnapshotsClient } from "@/lib/data/client-usage";
import { getSyncControlOptions } from "@/lib/data/sync-control-options";
import { getSyncOperationHistory } from "@/lib/data/sync-operation-history";
import { formatNumber } from "@/lib/format";
import { getSyncOperation } from "@/lib/sync/catalog";
import { useConsoleEnvironment } from "@/lib/environment";

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function DataManagementPage() {
  const { admin } = useAdminAuth();
  const environment = useConsoleEnvironment();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canViewSync = Boolean(admin && hasAdminPermission(admin.role, "sync.read"));
  const canViewUsage = Boolean(admin && hasAdminPermission(admin.role, "system.read"));
  const canViewAudit = Boolean(admin && hasAdminPermission(admin.role, "audit.read"));

  useEffect(() => {
    if (admin && !canViewSync && !canViewUsage && !canViewAudit) router.replace("/?reason=forbidden");
  }, [admin, canViewAudit, canViewSync, canViewUsage, router]);

  const { data, error, loading, reload } = useClientData(async () => {
    const [usage, syncOptions, syncHistory, audit] = await Promise.all([
      canViewSync || canViewUsage ? getDashboardUsageSnapshotsClient() : Promise.resolve(null),
      canViewSync ? getSyncControlOptions() : Promise.resolve(null),
      canViewSync ? getSyncOperationHistory() : Promise.resolve(null),
      canViewAudit ? getAuditLogList() : Promise.resolve(null),
    ]);
    return { usage, syncOptions, syncHistory, audit };
  }, [canViewSync, canViewUsage, canViewAudit]);
  if (!admin || loading) return <ClientPageLoading />;
  if (!canViewSync && !canViewUsage && !canViewAudit) return <ClientPageLoading label="접근 권한을 확인하고 있습니다." />;
  if (error || !data) return <ClientPageError message={error ?? "데이터 관리 정보를 확인할 수 없습니다."} retry={reload} />;
  const { usage, syncOptions, syncHistory, audit } = data;
  const query = {
    operation: searchParams.get("operation") ?? undefined,
    teamId: searchParams.get("teamId") ?? undefined,
    fixtureId: searchParams.get("fixtureId") ?? undefined,
  };
  const providerAllowance = usage?.sportsMonks.allowance ?? positiveNumber(process.env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE);
  const providerRemaining = usage?.sportsMonks.remaining ?? null;
  const lowQuotaThreshold = providerAllowance === null ? 200 : Math.max(1, Math.floor(providerAllowance * 0.15));
  const providerQuotaLow = providerRemaining !== null && providerRemaining <= lowQuotaThreshold;
  const canRunSync = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "sync.run");

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title="데이터 관리" />

      {canViewSync && usage && syncOptions && syncHistory ? (
        <section className="mt-6" aria-labelledby="sync-operations-title">
          <div className="mb-3 flex items-center gap-2">
            <RefreshCcw className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 id="sync-operations-title" className="text-base font-semibold">실행할 작업</h2>
          </div>
          {syncOptions.error ? <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 text-sm text-warning"><CircleAlert className="mt-0.5 size-4 shrink-0" />{syncOptions.error}</div> : null}
          <SyncControl
            teams={syncOptions.teams}
            fixtures={syncOptions.fixtures}
            canRun={canRunSync}
            secretReady={process.env.NEXT_PUBLIC_ADMIN_SYNC_ENABLED !== "false"}
            environment={environment}
            initialOperation={getSyncOperation(query.operation ?? "")?.key}
            initialTeamId={syncOptions.teams.some((team) => team.id === query.teamId) ? query.teamId : undefined}
            initialFixtureId={syncOptions.fixtures.some((fixture) => fixture.id === query.fixtureId) ? query.fixtureId : undefined}
            providerRemaining={providerRemaining}
            providerAllowance={providerAllowance}
            providerResetAt={usage.sportsMonks.resetAt}
            providerQuotaLow={providerQuotaLow}
            lastSync={syncHistory}
          />
        </section>
      ) : null}

      {canViewUsage && usage ? (
        <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70" aria-labelledby="usage-summary-title">
          <h2 id="usage-summary-title" className="sr-only">서비스 사용량</h2>
          <div className="grid gap-px md:grid-cols-2 xl:grid-cols-3">
            <CompactUsageGauge title="데이터베이스 사용량" icon={Database} centerValue={usage.database.centerValue} rate={usage.database.rate} status={usage.database.status} note={`전체 한도 ${usage.database.limitLabel}`} />
            <CompactUsageGauge title="파일 스토리지 사용량" icon={HardDrive} centerValue={usage.fileStorage.centerValue} rate={usage.fileStorage.rate} status={usage.fileStorage.status} note={`전체 한도 ${usage.fileStorage.limitLabel}`} />
            <CompactUsageGauge title="SportsMonks 사용량" icon={Activity} centerValue={usage.provider.centerValue} rate={usage.provider.rate} status={usage.provider.status} note={providerAllowance === null ? "시간당 호출 한도 설정 필요" : `시간당 ${formatNumber(providerAllowance)}회`} />
          </div>
        </section>
      ) : null}

      {canViewAudit && audit ? (
        <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="audit-log-title">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="audit-log-title" className="text-base font-semibold">관리자 로그</h2>
            <p className="text-xs text-muted-foreground">최근 변경 기록 {audit.logs.length}건</p>
          </div>
          {audit.error ? (
            <p className="border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/75">{audit.error}</p>
          ) : null}
          <AuditLogTable logs={audit.logs} schemaReady={audit.schemaReady} />
        </section>
      ) : null}
    </div>
  );
}

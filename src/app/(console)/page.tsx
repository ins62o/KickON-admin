"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  BellRing,
  CircleAlert,
  Database,
  DatabaseZap,
  HardDrive,
  Headphones,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { AdminStatusBadge } from "@/components/admin/status-badge";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { CompactUsageGauge } from "@/components/dashboard/compact-usage-gauge";
import { SyncControl } from "@/components/sync/sync-control";
import {
  getAdminDashboardAttention,
  getAdminDashboardSummary,
  type AdminDashboardAttentionItem,
} from "@/lib/admin/console-data";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getDashboardUsageSnapshotsClient } from "@/lib/data/client-usage";
import { getSyncOperationHistory } from "@/lib/data/sync-operation-history";
import { getSyncControlOptions } from "@/lib/data/sync-control-options";
import { formatNumber } from "@/lib/format";
import { useConsoleEnvironment } from "@/lib/environment";

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function DashboardAttentionLink({ href, title, item, icon: Icon }: {
  href: string;
  title: string;
  item: AdminDashboardAttentionItem;
  icon: typeof Headphones;
}) {
  const count = item.count ?? 0;
  const hasItems = count > 0;

  return (
    <Link
      href={href}
      className="flex min-h-28 items-center justify-between gap-5 bg-card px-4 py-5 transition-colors hover:bg-primary/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      aria-label={`${title} ${formatNumber(count)}건 보기`}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground sm:text-lg">{title}</h3>
        </div>
      </div>
      <p className={hasItems ? "tabular shrink-0 text-2xl font-bold text-foreground" : "tabular shrink-0 text-2xl font-bold text-muted-foreground"}>
        {formatNumber(count)}건
      </p>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const admin = useRequiredAdminPermission("dashboard.read");
  const environment = useConsoleEnvironment();
  const searchParams = useSearchParams();
  const { data, error, loading, reload } = useClientData(async () => {
    const [dashboard, attention, usage, syncOptions, syncHistory] = await Promise.all([
      getAdminDashboardSummary(),
      getAdminDashboardAttention(),
      getDashboardUsageSnapshotsClient(),
      getSyncControlOptions(),
      getSyncOperationHistory(),
    ]);
    return { dashboard, attention, usage, syncOptions, syncHistory };
  });
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "대시보드 데이터를 확인할 수 없습니다."} retry={reload} />;
  const { dashboard, attention, usage, syncOptions, syncHistory } = data;
  const query = { reason: searchParams.get("reason") ?? undefined };

  const providerAllowance = usage.sportsMonks.allowance
    ?? positiveNumber(process.env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE);
  const providerRemaining = usage.sportsMonks.remaining;
  const lowQuotaThreshold = providerAllowance === null
    ? 200
    : Math.max(1, Math.floor(providerAllowance * 0.15));
  const providerQuotaLow = providerRemaining !== null && providerRemaining <= lowQuotaThreshold;
  const canReadInquiries = hasAdminPermission(admin.role, "support.read");
  const canReadReports = hasAdminPermission(admin.role, "moderation.read");
  const canRunSync = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "sync.run");
  const syncFailureDetected = dashboard.syncFailure24h === "detected";
  const syncUnavailable = dashboard.syncFailure24h === "unavailable";
  const syncIssues = [dashboard.syncError, syncOptions.error]
    .filter((message): message is string => message !== null)
    .filter((message, index, messages) => messages.indexOf(message) === index);

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader
        title="대시보드"
      />

      {query.reason === "forbidden" ? (
        <div
          role="alert"
          className="mt-5 flex items-start gap-2 border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          요청한 메뉴의 관리자 권한이 없습니다.
        </div>
      ) : null}

      <section
        className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70"
        aria-labelledby="overview-title"
      >
        <h2 id="overview-title" className="sr-only">가입자 및 사용량 요약</h2>
        <div className="grid gap-px md:grid-cols-2 xl:grid-cols-4">
          <article className="flex min-h-72 flex-col bg-card px-4 py-5 sm:px-5">
            <header className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                  <UsersRound className="size-4" aria-hidden="true" />
                </span>
                <h3 className="truncate text-sm font-semibold">총 가입자</h3>
              </div>
              <AdminStatusBadge
                className="self-center"
                label={dashboard.totalProfiles === null ? "확인 필요" : "정상"}
                tone={dashboard.totalProfiles === null ? "warning" : "success"}
              />
            </header>

            <div className="flex flex-1 items-center justify-center py-4">
              <div className="flex size-44 items-center justify-center rounded-full border-[16px] border-primary/10 bg-primary/[0.03] text-center">
                <p className="tabular max-w-32 truncate text-3xl font-bold tracking-[-0.05em] sm:text-4xl">
                  {dashboard.totalProfiles === null
                    ? "-"
                    : `${formatNumber(dashboard.totalProfiles)}명`}
                </p>
              </div>
            </div>

            <p className="line-clamp-2 min-h-4 border-t border-border/70 pt-3 text-center text-xs text-muted-foreground">
              {dashboard.profilesError ?? "사용자 수"}
            </p>
          </article>

          <CompactUsageGauge
            title="데이터베이스 사용량"
            icon={Database}
            centerValue={usage.database.centerValue}
            rate={usage.database.rate}
            status={usage.database.status}
            note={`전체 한도 ${usage.database.limitLabel}`}
          />
          <CompactUsageGauge
            title="파일 스토리지 사용량"
            icon={HardDrive}
            centerValue={usage.fileStorage.centerValue}
            rate={usage.fileStorage.rate}
            status={usage.fileStorage.status}
            note={`전체 한도 ${usage.fileStorage.limitLabel}`}
          />
          <CompactUsageGauge
            title="SportsMonks 사용량"
            icon={Activity}
            centerValue={usage.provider.centerValue}
            rate={usage.provider.rate}
            status={usage.provider.status}
            note={providerAllowance === null
              ? "시간당 호출 한도 설정 필요"
              : `시간당 ${formatNumber(providerAllowance)}회`}
          />
        </div>
      </section>

      <section
        className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35"
        aria-labelledby="sync-control-title"
      >
        <header className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <DatabaseZap className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 id="sync-control-title" className="text-base font-semibold">데이터 동기화 관리</h2>
            </div>
          </div>
          <AdminStatusBadge
            size="default"
            label={syncUnavailable ? "확인 필요" : syncFailureDetected ? "최근 실패 있음" : "정상"}
            tone={syncUnavailable ? "warning" : syncFailureDetected ? "danger" : "success"}
          />
        </header>

        {syncIssues.length > 0 ? (
          <div className="flex items-start gap-2 border-b border-border/70 bg-warning/5 px-4 py-3 text-xs text-warning sm:px-5">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              {syncIssues.map((message) => <p key={message}>{message}</p>)}
            </div>
          </div>
        ) : null}

        <div className="p-4 sm:p-5">
          <SyncControl
            teams={syncOptions.teams}
            fixtures={syncOptions.fixtures}
            canRun={canRunSync}
            secretReady={process.env.NEXT_PUBLIC_ADMIN_SYNC_ENABLED !== "false"}
            environment={environment}
            providerRemaining={providerRemaining}
            providerAllowance={providerAllowance}
            providerResetAt={usage.sportsMonks.resetAt}
            providerQuotaLow={providerQuotaLow}
            lastSync={syncHistory}
          />
        </div>
      </section>

      {canReadInquiries || canReadReports ? (
        <section
          className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35"
          aria-labelledby="attention-title"
        >
          <header className="border-b border-border/70 px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <BellRing className="size-4" aria-hidden="true" />
              </span>
              <h2 id="attention-title" className="text-base font-semibold">운영 알림</h2>
            </div>
          </header>
          <div className="p-4 sm:p-5">
            <div className="overflow-hidden rounded-xl border border-border/80 bg-border/70">
              <div className={canReadInquiries && canReadReports ? "grid gap-px md:grid-cols-2" : "grid gap-px"}>
                {canReadInquiries ? (
                  <DashboardAttentionLink
                    href="/inquiries?tab=inquiries&status=new"
                    title="1:1 문의"
                    item={attention.inquiries}
                    icon={Headphones}
                  />
                ) : null}
                {canReadReports ? (
                  <DashboardAttentionLink
                    href="/inquiries?tab=reports&status=new"
                    title="신고 내역"
                    item={attention.reports}
                    icon={ShieldAlert}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

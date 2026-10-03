"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  CircleAlert,
  ChevronRight,
  Database,
  DatabaseZap,
  HardDrive,
  Headphones,
  MapPinCheck,
  MessageSquareText,
  ShieldAlert,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { AdminStatusBadge, type AdminStatusTone } from "@/components/admin/status-badge";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { CompactUsageGauge } from "@/components/dashboard/compact-usage-gauge";
import { SyncControl } from "@/components/sync/sync-control";
import {
  getAdminDashboardAttention,
  getAdminDashboardActivity,
  getAdminDashboardSummary,
} from "@/lib/admin/console-data";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getDashboardUsageSnapshotsClient } from "@/lib/data/client-usage";
import { getSyncOperationHistory } from "@/lib/data/sync-operation-history";
import { getSyncControlOptions } from "@/lib/data/sync-control-options";
import type { HealthStatus } from "@/lib/data/types";
import { formatNumber } from "@/lib/format";
import { useConsoleEnvironment } from "@/lib/environment";

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const mobileStatus: Record<HealthStatus, { label: string; tone: AdminStatusTone }> = {
  normal: { label: "정상", tone: "success" },
  warning: { label: "주의", tone: "warning" },
  danger: { label: "한도 임박", tone: "danger" },
  unknown: { label: "확인 필요", tone: "neutral" },
};

const PROFILE_TARGET = 1_000;

function DashboardMobileMetric({
  title,
  value,
  icon: Icon,
  status,
  note,
  rate,
  rateLabel = "사용률",
  href,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  status: HealthStatus;
  note: string;
  rate?: number | null;
  rateLabel?: string;
  href?: string;
}) {
  const normalizedRate = rate === null ? null : rate === undefined ? undefined : Math.min(100, Math.max(0, rate));
  const statusMeta = mobileStatus[status];
  const gaugeColor = status === "danger"
    ? "var(--gauge-danger)"
    : status === "warning"
      ? "var(--gauge-warning)"
      : "var(--gauge-normal)";

  const content = (
    <article className="flex min-h-44 min-w-0 flex-col bg-card p-3.5">
      <header className="flex items-center justify-between gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <AdminStatusBadge label={statusMeta.label} tone={statusMeta.tone} />
      </header>

      <div className="mt-3 min-w-0 pb-2">
        <h3 className="line-clamp-2 h-8 text-xs leading-4 font-semibold text-muted-foreground">{title}</h3>
        <p className="tabular flex h-8 items-center truncate text-xl font-bold tracking-tight text-foreground">{value}</p>
      </div>

      <div className="mt-auto min-h-11 border-t border-border/70 pt-3">
        {normalizedRate !== undefined ? (
          <>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{note}</span>
              <strong className="tabular shrink-0 font-semibold" style={{ color: gaugeColor }}>
                {normalizedRate === null ? "계산 필요" : `${normalizedRate.toFixed(1)}%`}
              </strong>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--gauge-track)]"
              role="progressbar"
              aria-label={`${title} ${rateLabel}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={normalizedRate ?? undefined}
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${normalizedRate ?? 0}%`, backgroundColor: gaugeColor }}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] text-muted-foreground">{note}</p>
            {href ? <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
          </div>
        )}
      </div>
    </article>
  );

  return href ? (
    <Link href={href} aria-label={`${title} ${value} 상세 보기`} className="block min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>article]:transition-colors hover:[&>article]:bg-accent/40">
      {content}
    </Link>
  ) : content;
}

export default function AdminDashboardPage() {
  const admin = useRequiredAdminPermission("dashboard.read");
  const environment = useConsoleEnvironment();
  const searchParams = useSearchParams();
  const { data, error, loading, reload } = useClientData(async () => {
    const [dashboard, activity, attention, usage, syncOptions, syncHistory] = await Promise.all([
      getAdminDashboardSummary(),
      getAdminDashboardActivity(),
      getAdminDashboardAttention(),
      getDashboardUsageSnapshotsClient(),
      getSyncControlOptions("all"),
      getSyncOperationHistory("all"),
    ]);
    return { dashboard, activity, attention, usage, syncOptions, syncHistory };
  });
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "대시보드 데이터를 확인할 수 없습니다."} retry={reload} />;
  const { dashboard, activity, attention, usage, syncOptions, syncHistory } = data;
  const query = { reason: searchParams.get("reason") ?? undefined };
  const profileRate = dashboard.totalProfiles === null
    ? null
    : Math.min(100, Math.max(0, (dashboard.totalProfiles / PROFILE_TARGET) * 100));

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
        <div className="grid grid-cols-2 gap-px md:hidden">
          <DashboardMobileMetric
            title="총 가입자"
            icon={UsersRound}
            value={dashboard.totalProfiles === null ? "-" : `${formatNumber(dashboard.totalProfiles)}명`}
            rate={profileRate}
            rateLabel="목표 달성률"
            status={dashboard.totalProfiles === null ? "warning" : "normal"}
            note={dashboard.profilesError ?? `목표 ${formatNumber(PROFILE_TARGET)}명`}
          />
          <DashboardMobileMetric
            title="데이터베이스 사용량"
            icon={Database}
            value={usage.database.centerValue}
            rate={usage.database.rate}
            status={usage.database.status}
            note={`한도 ${usage.database.limitLabel}`}
          />
          <DashboardMobileMetric
            title="파일 스토리지 사용량"
            icon={HardDrive}
            value={usage.fileStorage.centerValue}
            rate={usage.fileStorage.rate}
            status={usage.fileStorage.status}
            note={`한도 ${usage.fileStorage.limitLabel}`}
          />
          <DashboardMobileMetric
            title="SportsMonks 전체 사용량"
            icon={Activity}
            value={usage.provider.centerValue}
            rate={usage.provider.rate}
            status={usage.provider.status}
            note={providerAllowance === null ? "한도 설정 필요" : `시간당 ${formatNumber(providerAllowance)}회`}
          />
        </div>

        <div className="hidden gap-px md:grid md:grid-cols-2 xl:grid-cols-4">
          <CompactUsageGauge
            title="총 가입자"
            icon={UsersRound}
            centerValue={dashboard.totalProfiles === null ? "-" : `${formatNumber(dashboard.totalProfiles)}명`}
            rate={profileRate}
            rateLabel="목표 달성률"
            rateSuffix="달성"
            status={dashboard.totalProfiles === null ? "warning" : "normal"}
            note={dashboard.profilesError ?? `목표 ${formatNumber(PROFILE_TARGET)}명`}
          />

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
            title="SportsMonks 전체 사용량"
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
        className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70"
        aria-labelledby="activity-title"
      >
        <h2 id="activity-title" className="sr-only">커뮤니티 및 운영 내역 요약</h2>
        <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
          <DashboardMobileMetric
            title="커뮤니티 글"
            href="/community/posts"
            icon={MessageSquareText}
            value={activity.posts.count === null ? "-" : `${formatNumber(activity.posts.count)}개`}
            status={activity.posts.count === null ? "unknown" : "normal"}
            note={activity.posts.error ?? "현재 등록된 전체 글 · 공지 포함"}
          />
          <DashboardMobileMetric
            title="직관 인증"
            href="/attendances"
            icon={MapPinCheck}
            value={activity.attendances.count === null ? "-" : `${formatNumber(activity.attendances.count)}건`}
            status={activity.attendances.count === null ? "unknown" : "normal"}
            note={activity.attendances.error ?? "전체 경기 누적 인증"}
          />
          <DashboardMobileMetric
            title="1:1 문의"
            href={canReadInquiries ? "/inquiries?tab=inquiries&status=new" : undefined}
            icon={Headphones}
            value={!canReadInquiries ? "권한 필요" : attention.inquiries.count === null ? "-" : `${formatNumber(attention.inquiries.count)}건`}
            status={!canReadInquiries || attention.inquiries.count === null ? "unknown" : attention.inquiries.count > 0 ? "warning" : "normal"}
            note={!canReadInquiries ? "문의 조회 권한이 필요합니다" : attention.inquiries.error ?? "새 문의 · 접수 및 처리 중"}
          />
          <DashboardMobileMetric
            title="신고 내역"
            href={canReadReports ? "/inquiries?tab=reports&status=new" : undefined}
            icon={ShieldAlert}
            value={!canReadReports ? "권한 필요" : attention.reports.count === null ? "-" : `${formatNumber(attention.reports.count)}건`}
            status={!canReadReports || attention.reports.count === null ? "unknown" : attention.reports.count > 0 ? "warning" : "normal"}
            note={!canReadReports ? "신고 조회 권한이 필요합니다" : attention.reports.error ?? "새 신고 · 접수 및 검토 중"}
          />
        </div>
      </section>

      <section
        className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35"
        aria-labelledby="sync-control-title"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
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
            label={syncUnavailable ? "확인 필요" : syncFailureDetected ? "최근 실패 있음 · 전체 리그" : "정상"}
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

        <div className="p-3 sm:p-5">
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
            compactOnMobile
          />
        </div>
      </section>

    </div>
  );
}

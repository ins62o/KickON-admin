import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, CircleDotDashed, RefreshCcw } from "lucide-react";
import { DataManagementHeader } from "@/components/admin/data-management-header";
import { SyncTable } from "@/components/dashboard/sync-table";
import { SyncControl } from "@/components/sync/sync-control";
import { requireAdminPermission } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { getDashboardData } from "@/lib/data/dashboard";
import { getFixturesData } from "@/lib/data/operations";
import { getProviderUsageData } from "@/lib/data/platform-operations";
import { getSyncOperationHistory } from "@/lib/data/sync-operation-history";
import { formatKoreaDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { getSyncOperation, syncCoverage } from "@/lib/sync/catalog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "데이터 관리 · 데이터 동기화" };

function positiveNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default async function SyncPage({ searchParams }: { searchParams: Promise<{ operation?: string; teamId?: string; fixtureId?: string }> }) {
  const query = await searchParams;
  const [admin, dashboard, fixtures, providerUsage, syncHistory] = await Promise.all([
    requireAdminPermission("sync.read"),
    getDashboardData(),
    getFixturesData(),
    getProviderUsageData(),
    getSyncOperationHistory(),
  ]);
  const environment = process.env.KICKON_ENVIRONMENT === "production" ? "production" : "development";
  const providerAllowance = providerUsage.allowance ?? positiveNumber(process.env.SPORTSMONKS_API_ALLOWANCE);
  const lowQuotaThreshold = providerAllowance === null ? 200 : Math.max(1, Math.floor(providerAllowance * 0.15));
  const providerQuotaLow = providerUsage.remaining !== null && providerUsage.remaining <= lowQuotaThreshold;
  const generatedAt = new Date(dashboard.generatedAt).getTime();
  const sortedFixtures = fixtures.data
    .slice()
    .sort((a, b) => Math.abs(new Date(a.kickoffAt).getTime() - generatedAt) - Math.abs(new Date(b.kickoffAt).getTime() - generatedAt));
  const requestedFixture = sortedFixtures.find((fixture) => fixture.id === query.fixtureId);
  const fixtureOptions = (requestedFixture ? [requestedFixture, ...sortedFixtures.filter((fixture) => fixture.id !== requestedFixture.id)] : sortedFixtures)
    .slice(0, 80)
    .map((fixture) => ({
      id: fixture.id,
      label: `${formatKoreaDateTime(fixture.kickoffAt)} · ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    }));

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <DataManagementHeader role={admin.role} activeSection="sync" />

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">데이터 동기화</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">필요한 구단이나 경기만 선택해 외부 축구 데이터를 다시 가져옵니다.</p>
        </div>
        <span className="rounded-md border border-border bg-card px-2 py-1 text-xs font-medium">{environment === "production" ? "운영 환경" : "개발 환경"}</span>
      </div>

      {admin.isDevelopmentBypass ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/75">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" /> 화면 확인은 가능하지만 외부 데이터 변경은 실제 관리자 로그인 후에만 실행할 수 있습니다.
        </div>
      ) : null}

      {providerQuotaLow ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-700/25 bg-amber-600/[0.08] px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-300" role="status">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">SportsMonks 잔여 할당량이 낮습니다</p>
            <p className="mt-0.5">현재 {formatNumber(providerUsage.remaining)}회 남았습니다. 각 작업의 확인 창에서 잔여량 부족을 다시 확인해야 실행할 수 있습니다.{providerUsage.resetAt ? ` 초기화는 ${formatRelativeTime(providerUsage.resetAt)} 예정입니다.` : ""}</p>
          </div>
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2"><RefreshCcw className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">실행할 작업</h2></div>
        <SyncControl
          teams={dashboard.clubs.map((club) => ({ id: club.id, name: club.name }))}
          fixtures={fixtureOptions}
          canRun={!admin.isDevelopmentBypass && hasAdminPermission(admin.role, "sync.run")}
          secretReady={Boolean(process.env.FOOTBALL_SYNC_SECRET)}
          environment={environment}
          initialOperation={getSyncOperation(query.operation ?? "")?.key}
          initialTeamId={dashboard.clubs.some((club) => club.id === query.teamId) ? query.teamId : undefined}
          initialFixtureId={requestedFixture?.id}
          providerRemaining={providerUsage.remaining}
          providerAllowance={providerAllowance}
          providerResetAt={providerUsage.resetAt}
          providerQuotaLow={providerQuotaLow}
          lastSync={syncHistory}
        />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="border-b border-border/70 px-4 py-3.5"><h2 className="text-sm font-semibold">새로고침 가능한 범위</h2><p className="mt-0.5 text-xs text-muted-foreground">현재 시스템에서 실제로 실행할 수 있는 대상과 포함 범위를 보여줍니다.</p></div>
        <div className="overflow-x-auto"><Table className="min-w-[720px]"><TableHeader><TableRow className="hover:bg-transparent"><TableHead>대상</TableHead><TableHead>지원 상태</TableHead><TableHead>처리 범위</TableHead></TableRow></TableHeader><TableBody>{syncCoverage.map((item) => <TableRow key={item.target}><TableCell><p className="font-medium">{item.target}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.operation}</p></TableCell><TableCell><Badge variant="outline" className={item.support === "direct" ? "border-emerald-400/20 text-emerald-300" : "text-muted-foreground"}>{item.support === "direct" ? <CheckCircle2 className="size-3" /> : <CircleDotDashed className="size-3" />}{({ direct: "직접 실행", included: "다른 작업에 포함", detected: "변경 자동 확인", missing: "추가 연결 필요" } as const)[item.support]}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{item.detail}</TableCell></TableRow>)}</TableBody></Table></div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="border-b border-border/70 px-4 py-3.5"><h2 className="text-sm font-semibold">최근 새로고침 상태</h2><p className="mt-0.5 text-xs text-muted-foreground">자동 작업의 최근 성공과 실패 기록</p></div>
        <SyncTable rows={dashboard.syncStates} />
      </section>
    </div>
  );
}

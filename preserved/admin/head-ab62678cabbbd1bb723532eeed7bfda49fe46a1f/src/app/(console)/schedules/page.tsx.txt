"use client";

import { CURRENT_SEASON } from "@/lib/football/config";
import { AlertTriangle, CalendarDays, MapPin } from "lucide-react";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { ScheduleCards } from "@/components/fixtures/schedule-table";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getFixturesData, getStadiumsData } from "@/lib/data/operations";
import { getProviderOverrideIndex } from "@/lib/data/provider-diffs";

export default function SchedulesPage() {
  const admin = useRequiredAdminPermission("data.read");
  const { data, error, loading, reload } = useClientData(async () => {
    const fixturesPromise = getFixturesData("all");
    const stadiumsPromise = getStadiumsData();
    const fixtures = await fixturesPromise;
    const [stadiums, overrides] = await Promise.all([
      stadiumsPromise,
      getProviderOverrideIndex("fixture", fixtures.data.map((fixture) => fixture.id), CURRENT_SEASON, "all"),
    ]);
    return { fixtures, stadiums, overrides };
  });
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "경기 일정을 확인할 수 없습니다."} retry={reload} />;

  const fixtures = data.fixtures.data.slice().sort((left, right) => {
    const priority = { LIVE: 0, SCHEDULED: 1, FINISHED: 2, CANCELED: 2 } as const;
    const priorityDifference = priority[left.status] - priority[right.status];
    if (priorityDifference !== 0) return priorityDifference;
    const kickoffDifference = new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime();
    return left.status === "SCHEDULED" || left.status === "LIVE" ? kickoffDifference : -kickoffDifference;
  });
  const scheduledCount = fixtures.filter((fixture) => fixture.status === "SCHEDULED").length;
  const customLocationCount = fixtures.filter((fixture) => fixture.attendanceLatitude !== null).length;
  const canEdit = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write");
  const dataError = data.fixtures.error ?? data.stadiums.error ?? data.overrides.error;

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title="일정 관리" />
    {dataError ? <div role="alert" className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{dataError}</div> : null}
    <MetricStrip
      className="mt-6 grid-cols-3!"
      compactOnMobile
      centered
      items={[
      { id: "fixtures", label: "전체 일정", value: `${fixtures.length.toLocaleString("ko-KR")}경기`, icon: CalendarDays, tone: "accent" },
      { id: "upcoming", label: "예정 상태", value: `${scheduledCount.toLocaleString("ko-KR")}경기`, icon: CalendarDays, tone: "neutral" },
      { id: "custom-location", label: "별도 인증 위치", value: `${customLocationCount.toLocaleString("ko-KR")}경기`, icon: MapPin, tone: customLocationCount > 0 ? "warning" : "neutral" },
    ]} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="schedule-list-title">
      <div className="border-b border-border/70 px-5 py-4"><h2 id="schedule-list-title" className="text-base font-semibold">경기 일정</h2></div>
      {fixtures.length === 0 && !dataError ? <p className="p-10 text-center text-muted-foreground">등록된 경기 일정이 없습니다</p> : null}
      <ScheduleCards fixtures={fixtures} stadiums={data.stadiums.data} overrides={data.overrides.overrides} canEdit={canEdit} />
    </section>
  </div>;
}

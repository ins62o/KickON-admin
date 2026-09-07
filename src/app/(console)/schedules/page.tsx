"use client";

import { AlertTriangle, CalendarDays, MapPin } from "lucide-react";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { ScheduleCards } from "@/components/fixtures/schedule-table";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getFixturesData, getStadiumsData } from "@/lib/data/operations";

export default function SchedulesPage() {
  const admin = useRequiredAdminPermission("data.read");
  const { data, error, loading, reload } = useClientData(async () => {
    const [fixtures, stadiums] = await Promise.all([getFixturesData(), getStadiumsData()]);
    return { fixtures, stadiums };
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
  const dataError = data.fixtures.error ?? data.stadiums.error;

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title="일정 관리" description="경기 날짜와 경기장, 직관 인증 위치를 수정합니다. 저장한 기준은 다음 인증 요청부터 바로 적용됩니다." />
    {dataError ? <div role="alert" className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{dataError}</div> : null}
    <MetricStrip className="mt-6" items={[
      { id: "fixtures", label: "전체 일정", value: `${fixtures.length.toLocaleString("ko-KR")}경기`, icon: CalendarDays, tone: "accent" },
      { id: "upcoming", label: "예정 상태", value: `${scheduledCount.toLocaleString("ko-KR")}경기`, icon: CalendarDays, tone: "neutral" },
      { id: "custom-location", label: "별도 인증 위치", value: `${customLocationCount.toLocaleString("ko-KR")}경기`, icon: MapPin, tone: customLocationCount > 0 ? "warning" : "neutral" },
    ]} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="schedule-list-title">
      <div className="border-b border-border/70 px-5 py-4"><h2 id="schedule-list-title" className="text-base font-semibold">경기 일정</h2><p className="mt-1 text-xs text-muted-foreground">날짜와 경기장 변경은 해당 경기만 적용되며 외부 데이터 동기화로 덮어쓰지 않습니다.</p></div>
      <ScheduleCards fixtures={fixtures} stadiums={data.stadiums.data} canEdit={canEdit} />
    </section>
  </div>;
}

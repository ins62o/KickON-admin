"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ActivityHistory } from "@/components/admin/activity-history";
import { ActivityTeamFilter } from "@/components/admin/activity-team-filter";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { UserNickname } from "@/components/admin/user-nickname";
import { getAttendanceRecords } from "@/lib/admin/activity-client";
import { getActivityPageNumber } from "@/lib/admin/activity-records";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { SUPPORTED_TEAM_IDS } from "@/lib/data/catalog";
import { formatKoreaDateTime } from "@/lib/format";

export default function AttendancesPage() {
  const admin = useRequiredAdminPermission("users.read");
  const params = useSearchParams();
  const page = getActivityPageNumber(params.get("page"));
  const query = (params.get("q") ?? "").slice(0, 200);
  const teamId = SUPPORTED_TEAM_IDS.find((id) => id === params.get("team")) ?? "";
  const { data, error, loading, reload } = useClientData(() => admin ? getAttendanceRecords(page, query, undefined, teamId) : Promise.resolve(null), [admin?.userId, page, query, teamId]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "직관 인증 내역을 불러오지 못했습니다."} retry={reload} />;
  return <ActivityHistory title="직관 인증" base="/attendances" total={data.total} page={page} query={query} placeholder="사용자, 경기, 구장 검색" showDashboardLink={false} teamId={teamId} filters={<ActivityTeamFilter teamId={teamId} label="직관 인증 팀 선택" />}>
    <div className="divide-y divide-border/70">
      {data.records.map((attendance) => {
        const search = new URLSearchParams({ attendanceId: attendance.id, page: String(page), q: query });
        if (teamId) search.set("team", teamId);
        return <Link key={attendance.id} href={`/attendances/detail?${search}`} className="flex items-center justify-between gap-4 px-4 py-5 transition-colors hover:bg-primary/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold"><UserNickname nickname={attendance.user_name ?? "사용자 확인 불가"} teamId={attendance.user_team_id} /></h2>
            <p className="mt-2 break-words text-sm">{attendance.fixture ? `${attendance.fixture.home_team_name ?? "홈 팀"} vs ${attendance.fixture.away_team_name ?? "원정 팀"}` : attendance.fixture_id}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{attendance.team_name ?? attendance.team_id} 응원</span><span>{attendance.stadium_name ?? attendance.stadium_id}</span><span>{formatKoreaDateTime(attendance.verified_at)}</span><span>{attendance.verification_type === "MANUAL" ? "수동 인증" : "GPS 인증"}</span></div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>;
      })}
      {data.records.length === 0 && data.total > 0 ? <p className="p-8 text-center text-sm text-muted-foreground">이 페이지에 내역이 없습니다. 이전 페이지에서 확인해 주세요.</p> : null}
    </div>
  </ActivityHistory>;
}

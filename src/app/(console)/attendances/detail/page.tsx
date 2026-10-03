"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { ActivityDetailField, activityListHref } from "@/components/admin/activity-history";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { UserNickname } from "@/components/admin/user-nickname";
import { getAttendanceRecord } from "@/lib/admin/activity-client";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { getActivityPageNumber } from "@/lib/admin/activity-records";
import { useClientData } from "@/lib/client-data";
import { formatKoreaDateTime } from "@/lib/format";

const results: Record<string, string> = { WIN: "승리", DRAW: "무승부", LOSS: "패배", PENDING: "결과 대기" };
const fixtureStatuses: Record<string, string> = { SCHEDULED: "예정", LIVE: "진행 중", FINISHED: "종료", POSTPONED: "연기", CANCELLED: "취소" };

function coordinates(latitude: number | null, longitude: number | null) {
  return latitude === null || longitude === null ? "설정되지 않음" : `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export default function AttendanceDetailPage() {
  const admin = useRequiredAdminPermission("users.read");
  const params = useSearchParams();
  const id = params.get("attendanceId") ?? "";
  const backHref = activityListHref("/attendances", getActivityPageNumber(params.get("page")), params.get("q") ?? "", params.get("team") ?? "");
  const { data: attendance, error, loading, reload } = useClientData(() => admin ? getAttendanceRecord(id) : Promise.resolve(null), [admin?.userId, id]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error) return <ClientPageError message={error} retry={reload} />;
  if (!attendance) return <div className="p-8 text-center"><p>직관 인증 내역을 찾을 수 없습니다. 삭제된 인증일 수 있습니다.</p><Link href={backHref} className="mt-4 inline-block text-primary hover:underline">직관 인증 목록으로</Link></div>;
  const fixture = attendance.fixture;
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title="직관 인증 상세" />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="attendance-info-title">
      <h2 id="attendance-info-title" className="px-4 py-4 text-base font-semibold">인증 정보</h2>
      <dl className="grid gap-px border-t border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
        <ActivityDetailField label="사용자"><Link href={`/users/detail?userId=${encodeURIComponent(attendance.user_id)}`} className="text-primary hover:underline"><UserNickname nickname={attendance.user_name ?? "사용자 확인 불가"} teamId={attendance.user_team_id} /></Link></ActivityDetailField>
        <ActivityDetailField label="사용자 ID">{attendance.user_id}</ActivityDetailField>
        <ActivityDetailField label="응원 팀">{attendance.team_name ?? attendance.team_id}</ActivityDetailField>
        <ActivityDetailField label="인증 시각">{formatKoreaDateTime(attendance.verified_at)}</ActivityDetailField>
        <ActivityDetailField label="인증 방식">{attendance.verification_type === "MANUAL" ? "수동 인증" : attendance.verification_type === "GPS" ? "GPS 인증" : attendance.verification_type}</ActivityDetailField>
        <ActivityDetailField label="직관 결과">{results[attendance.result] ?? attendance.result}</ActivityDetailField>
        <ActivityDetailField label="인증 좌표 (위도, 경도)">{coordinates(attendance.latitude, attendance.longitude)}</ActivityDetailField>
        <ActivityDetailField label="인증 지점과 기준 위치 사이 거리">{attendance.distance_from_stadium.toFixed(1)}m</ActivityDetailField>
        <ActivityDetailField label="인증 ID">{attendance.id}</ActivityDetailField>
      </dl>
    </section>
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="attendance-fixture-title">
      <h2 id="attendance-fixture-title" className="px-4 py-4 text-base font-semibold">경기 및 구장 정보</h2>
      <dl className="grid gap-px border-t border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
        <ActivityDetailField label="경기">{fixture ? `${fixture.home_team_name ?? "홈 팀"} vs ${fixture.away_team_name ?? "원정 팀"}` : "경기 정보 확인 불가"}</ActivityDetailField>
        <ActivityDetailField label="경기 시작">{fixture ? formatKoreaDateTime(fixture.kickoff_at) : "확인 불가"}</ActivityDetailField>
        <ActivityDetailField label="경기 상태">{fixture ? fixtureStatuses[fixture.status] ?? fixture.status : "확인 불가"}</ActivityDetailField>
        <ActivityDetailField label="스코어">{fixture?.home_score != null && fixture.away_score != null ? `${fixture.home_score} : ${fixture.away_score}` : "집계 전"}</ActivityDetailField>
        <ActivityDetailField label="구장">{attendance.stadium_name ?? attendance.stadium_id}</ActivityDetailField>
        <ActivityDetailField label="구장 주소">{attendance.stadium_address ?? "등록되지 않음"}</ActivityDetailField>
        <ActivityDetailField label="경기 ID">{hasAdminPermission(admin.role, "data.read") ? <Link href={`/schedules/detail?fixtureId=${encodeURIComponent(attendance.fixture_id)}`} className="text-primary hover:underline">{attendance.fixture_id}</Link> : attendance.fixture_id}</ActivityDetailField>
        <ActivityDetailField label="구장 ID">{attendance.stadium_id}</ActivityDetailField>
        <ActivityDetailField label="리그 · 라운드">{fixture ? `${fixture.league_id} · ${fixture.round ?? "미정"}라운드` : "확인 불가"}</ActivityDetailField>
        <ActivityDetailField label="현재 인증 기준 좌표">{fixture ? coordinates(fixture.attendance_latitude, fixture.attendance_longitude) : "설정되지 않음"}</ActivityDetailField>
        <ActivityDetailField label="현재 인증 반경">{fixture?.attendance_radius_meters == null ? "설정되지 않음" : `${fixture.attendance_radius_meters}m`}</ActivityDetailField>
      </dl>
    </section>
  </div>;
}

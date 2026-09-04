"use client";

import Link from "next/link";
import { ArrowLeft, MessageCircle, ShieldAlert, TicketCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { UserModerationForm } from "@/components/admin/user-moderation-form";
import { getAdminUsersData } from "@/lib/admin/console-data";
import { accountStatusLabel, statusTone } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";

export default function UserDetailPage() {
  const admin = useRequiredAdminPermission("users.read");
  const userId = useSearchParams().get("userId") ?? "";
  const { data, error, loading, reload } = useClientData(getAdminUsersData);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "사용자 데이터를 확인할 수 없습니다."} retry={reload} />;
  const user = data.users.find((item) => item.id === userId);
  if (!user) return <ClientPageError message="사용자를 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;

  return <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context={<Link href="/users" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" />사용자 목록</Link>} title={user.nickname} description="사용자 활동과 계정 운영 상태를 확인합니다." status={<AdminStatusBadge label={accountStatusLabel(user.accountStatus)} tone={statusTone(user.accountStatus)} />} metadata={<><span>가입 {formatKoreaDateTime(user.createdAt)}</span><span>최근 활동 {user.recentActivityAt ? formatRelativeTime(user.recentActivityAt) : "기록 없음"}</span></>} actions={<Button asChild variant="outline" size="sm"><Link href={`/moderation?q=${encodeURIComponent(user.id)}`}><ShieldAlert className="size-3.5" />관련 신고</Link></Button>} />
    <MetricStrip className="mt-6" items={[
      { id: "posts", label: "게시글", value: user.postCount ?? "-", icon: MessageCircle },
      { id: "comments", label: "댓글", value: user.commentCount ?? "-", icon: MessageCircle },
      { id: "attendances", label: "직관 인증", value: user.attendanceCount ?? "-", icon: TicketCheck },
      { id: "reports", label: "받은 신고", value: user.reportCount ?? "-", icon: ShieldAlert, tone: (user.reportCount ?? 0) > 0 ? "warning" : "success" },
      { id: "warnings", label: "누적 경고", value: user.warningCount ?? "-", icon: ShieldAlert, tone: (user.warningCount ?? 0) > 0 ? "danger" : "neutral" },
    ]} />
    <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-4" aria-labelledby="profile-title"><h2 id="profile-title" className="text-sm font-semibold">프로필 정보</h2><dl className="mt-4 grid gap-px overflow-hidden rounded-lg bg-border/70 sm:grid-cols-2"><Detail label="사용자 ID" value={user.id} mono /><Detail label="응원 팀" value={user.teamName ?? "미선택"} /><Detail label="계정 상태" value={accountStatusLabel(user.accountStatus)} /><Detail label="정지 종료" value={user.suspendedUntil ? formatKoreaDateTime(user.suspendedUntil) : "해당 없음"} /></dl></section>
    {data.enhancementsReady && hasAdminPermission(admin.role, "users.moderate") ? <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-4" aria-labelledby="moderate-user-title"><h2 id="moderate-user-title" className="text-sm font-semibold">사용자 조치</h2><p className="mt-1 text-xs text-muted-foreground">경고 기록 또는 커뮤니티 쓰기 활동 정지·해제를 수행합니다.</p><div className="mt-4 max-w-xl"><UserModerationForm userId={user.id} suspended={user.accountStatus === "SUSPENDED"} /></div></section> : !data.enhancementsReady ? <p className="mt-4 text-xs text-warning">사용자 경고·정지·해제는 관리자 마이그레이션 적용 후 활성화됩니다.</p> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-card px-4 py-3"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className={`mt-1 break-all text-xs font-medium ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

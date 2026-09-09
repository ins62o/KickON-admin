"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle, ShieldAlert, TicketCheck, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { UserModerationDialog } from "@/components/admin/user-moderation-form";
import { getAdminUsersData } from "@/lib/admin/console-data";
import { accountStatusLabel } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getTeamLogoPath } from "@/lib/data/catalog";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";

export default function UserDetailPage() {
  const admin = useRequiredAdminPermission("users.read");
  const userId = useSearchParams().get("userId") ?? "";
  const { data, error, loading, reload } = useClientData(getAdminUsersData);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "사용자 데이터를 확인할 수 없습니다."} retry={reload} />;
  const user = data.users.find((item) => item.id === userId);
  if (!user) return <ClientPageError message="사용자를 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;
  const teamLogoPath = user.teamId ? getTeamLogoPath(user.teamId) : null;

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title={<span className="flex items-center gap-3"><span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-card/70">{teamLogoPath ? <Image src={teamLogoPath} fill sizes="40px" alt={`${user.teamName ?? "응원 팀"} 엠블럼`} className="object-contain p-1.5" /> : <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />}</span><span>{user.nickname}</span></span>} actions={<><Button asChild variant="outline" size="default"><Link href={`/moderation?q=${encodeURIComponent(user.id)}`}>관련 신고</Link></Button>{data.enhancementsReady && hasAdminPermission(admin.role, "users.moderate") ? <UserModerationDialog userId={user.id} accountStatus={user.accountStatus} nickname={user.nickname} /> : null}</>} />
    <MetricStrip className="mt-6" items={[
      { id: "posts", label: "게시글", value: user.postCount ?? "-", icon: MessageCircle, tone: "accent" },
      { id: "comments", label: "댓글", value: user.commentCount ?? "-", icon: MessageCircle, tone: "accent" },
      { id: "attendances", label: "직관 인증", value: user.attendanceCount ?? "-", icon: TicketCheck, tone: "accent" },
      { id: "reports", label: "받은 신고", value: user.reportCount ?? "-", icon: ShieldAlert, tone: "danger" },
      { id: "warnings", label: "누적 경고", value: user.warningCount ?? "-", icon: ShieldAlert, tone: "danger" },
    ]} />
    <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-4" aria-labelledby="profile-title"><h2 id="profile-title" className="text-base font-semibold">프로필 정보</h2><dl className="mt-4 grid gap-px overflow-hidden rounded-lg bg-border/70 sm:grid-cols-2"><Detail label="사용자 ID" value={user.id} mono /><Detail label="응원 팀" value={user.teamName ?? "미선택"} /><Detail label="계정 상태" value={accountStatusLabel(user.accountStatus)} /><Detail label="정지 종료" value={user.suspendedUntil ? formatKoreaDateTime(user.suspendedUntil) : "해당 없음"} /><Detail label="가입일자" value={formatKoreaDateTime(user.createdAt)} /><Detail label="최근 활동" value={user.recentActivityAt ? formatRelativeTime(user.recentActivityAt) : "기록 없음"} /></dl></section>
    {!data.enhancementsReady ? <p className="mt-4 text-xs text-warning">사용자 정지·해제는 관리자 마이그레이션 적용 후 활성화됩니다.</p> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="bg-card px-4 py-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-1.5 break-all text-sm font-medium ${mono ? "font-mono" : ""}`}>{value}</dd></div>;
}

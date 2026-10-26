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
import { cn } from "@/lib/utils";

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
    <PageHeader
      title={<span className="flex min-w-0 items-center gap-3"><span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card/70 sm:size-10 sm:rounded-lg">{teamLogoPath ? <Image src={teamLogoPath} fill sizes="(max-width: 639px) 48px, 40px" alt={`${user.teamName ?? "응원 팀"} 엠블럼`} className="object-contain p-1.5" /> : <UsersRound className="size-5 text-muted-foreground sm:size-4" aria-hidden="true" />}</span><span className="min-w-0"><span className="block truncate">{user.nickname}</span><span className="mt-1 block truncate text-xs font-medium tracking-normal text-muted-foreground sm:hidden">{user.teamName ?? "응원 팀 미선택"}</span></span></span>}
      actions={<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"><Button asChild variant="outline" size="default" className="h-11! w-full font-extrabold sm:w-auto"><Link href={`/moderation?q=${encodeURIComponent(user.id)}`}>관련 신고</Link></Button>{data.enhancementsReady && hasAdminPermission(admin.role, "users.moderate") ? <UserModerationDialog userId={user.id} accountStatus={user.accountStatus} nickname={user.nickname} /> : null}</div>}
    />
    <MetricStrip compactOnMobile centered itemClassName="min-h-24 md:min-h-32" className="mt-5 grid-cols-2! [&>div:last-child]:col-span-2 sm:mt-6 sm:[grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]! sm:[&>div:last-child]:col-span-1" items={[
      { id: "posts", label: "게시글", value: user.postCount ?? "-", icon: MessageCircle, tone: "accent" },
      { id: "comments", label: "댓글", value: user.commentCount ?? "-", icon: MessageCircle, tone: "accent" },
      { id: "attendances", label: "직관 인증", value: user.attendanceCount ?? "-", icon: TicketCheck, tone: "accent" },
      { id: "reports", label: "받은 신고", value: user.reportCount ?? "-", icon: ShieldAlert, tone: "danger" },
      { id: "warnings", label: "누적 경고", value: user.warningCount ?? "-", icon: ShieldAlert, tone: "danger" },
    ]} />
    <section className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/35 sm:mt-6 sm:p-4" aria-labelledby="profile-title"><h2 id="profile-title" className="px-4 py-4 text-base font-semibold sm:p-0">프로필 정보</h2><dl className="grid gap-px border-t border-border/70 bg-border/70 sm:mt-4 sm:grid-cols-2 sm:overflow-hidden sm:rounded-lg sm:border-0 xl:grid-cols-3"><Detail label="사용자 ID" value={user.id} mono /><Detail label="응원 팀" value={user.teamName ?? "미선택"} /><Detail label="계정 상태" value={accountStatusLabel(user.accountStatus)} /><Detail label="정지 종료" value={user.suspendedUntil ? formatKoreaDateTime(user.suspendedUntil) : "해당 없음"} /><Detail label="가입일자" value={formatKoreaDateTime(user.createdAt)} /><Detail label="최근 활동" value={user.recentActivityAt ? formatRelativeTime(user.recentActivityAt) : "기록 없음"} /></dl></section>
    {!data.enhancementsReady ? <p className="mt-4 text-xs text-warning">사용자 정지·해제는 관리자 마이그레이션 적용 후 활성화됩니다.</p> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className={cn("bg-card px-4 py-3.5 sm:block sm:py-4", !mono && "flex items-start justify-between gap-4")}><dt className="shrink-0 text-xs text-muted-foreground">{label}</dt><dd className={cn("break-all text-sm font-medium", mono ? "mt-2 font-mono" : "min-w-0 text-right", "sm:mt-1.5 sm:text-left")}>{value}</dd></div>;
}

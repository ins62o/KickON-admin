import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { ContentVisibilityForm, ReportStatusForm } from "@/components/admin/moderation-action-form";
import { getModerationData } from "@/lib/admin/console-data";
import { reportStatusLabel, reportTargetLabel, statusTone } from "@/lib/admin/labels";
import { requireAdminPermission } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { formatKoreaDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "신고 상세" };

export default async function ModerationDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const admin = await requireAdminPermission("moderation.read");
  const { reportId } = await params;
  const data = await getModerationData();
  const report = data.reports.find((item) => item.id === reportId);
  if (!report) notFound();
  return <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context={<Link href="/moderation" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" />신고 목록</Link>} title={`${reportTargetLabel(report.targetType)} 신고`} description={report.reason} status={<AdminStatusBadge label={reportStatusLabel(report.status)} tone={statusTone(report.status)} />} metadata={<><span>접수 {formatKoreaDateTime(report.createdAt)}</span><span>같은 대상 누적 {formatNumber(report.cumulativeReportCount)}건</span></>} />
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-xl border border-border/80 bg-card/35 p-5" aria-labelledby="content-title"><div className="flex items-center justify-between gap-3"><h2 id="content-title" className="text-sm font-semibold">신고 대상 원문</h2><AdminStatusBadge label={report.target?.moderationStatus === "HIDDEN" ? "숨김" : report.target?.moderationStatus === "VISIBLE" ? "노출" : "상태 미적용"} tone={statusTone(report.target?.moderationStatus ?? null)} /></div>{report.target?.title ? <h3 className="mt-5 text-base font-semibold">{report.target.title}</h3> : null}<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">{report.target?.content || report.target?.emoticonKey || "원문을 찾을 수 없습니다."}</p></section>
      <aside className="space-y-5"><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">관련 사용자</h2><dl className="mt-3 space-y-3"><Detail label="작성자" value={report.target?.author?.nickname ?? "확인 불가"} /><Detail label="작성자 ID" value={report.target?.author?.id ?? "확인 불가"} mono /><Detail label="신고자" value={report.reporter?.nickname ?? "확인 불가"} /><Detail label="신고자 ID" value={report.reporter?.id ?? "확인 불가"} mono /></dl></section><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">신고 상세</h2><dl className="mt-3 space-y-3"><Detail label="사유" value={report.reason} /><Detail label="추가 설명" value={report.details ?? "없음"} /><Detail label="대상 ID" value={report.targetId ?? "확인 불가"} mono /></dl>{!data.enhancementsReady ? <p className="mt-4 text-xs leading-5 text-warning">콘텐츠 숨김·복원과 사용자 경고·정지는 관리자 마이그레이션 적용 후 활성화됩니다.</p> : null}</section></aside>
    </div>
    {data.enhancementsReady && hasAdminPermission(admin.role, "moderation.write") ? <section className="mt-6 grid gap-5 lg:grid-cols-2" aria-label="신고 조치"><div className="rounded-xl border border-border/80 bg-card/35 p-5"><h2 className="text-sm font-semibold">신고 상태 처리</h2><p className="mt-1 text-xs text-muted-foreground">완료·기각에는 처리 메모가 필요합니다.</p><div className="mt-4"><ReportStatusForm reportId={report.id} status={report.status} /></div></div>{report.targetId ? <div className="rounded-xl border border-border/80 bg-card/35 p-5"><h2 className="text-sm font-semibold">콘텐츠 노출 조치</h2><p className="mt-1 text-xs text-muted-foreground">삭제하지 않고 숨김·복원합니다.</p><div className="mt-4"><ContentVisibilityForm reportId={report.id} targetType={report.targetType} targetId={report.targetId} hidden={report.target?.moderationStatus === "HIDDEN"} /></div></div> : null}</section> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-all text-xs leading-5 ${mono ? "font-mono" : ""}`}>{value}</dd></div>; }

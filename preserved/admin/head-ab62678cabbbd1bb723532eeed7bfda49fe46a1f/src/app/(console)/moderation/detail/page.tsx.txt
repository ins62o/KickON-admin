"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { UserNickname } from "@/components/admin/user-nickname";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { ContentVisibilityForm, ReportStatusForm } from "@/components/admin/moderation-action-form";
import { getModerationData } from "@/lib/admin/console-data";
import { reportReasonLabel, reportStatusLabel, reportTargetLabel, statusTone } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { formatKoreaDateTime, formatNumber } from "@/lib/format";

export default function ModerationDetailPage() {
  const admin = useRequiredAdminPermission("moderation.read");
  const reportId = useSearchParams().get("reportId") ?? "";
  const { data, error, loading, reload } = useClientData(getModerationData);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "신고 데이터를 확인할 수 없습니다."} retry={reload} />;
  const report = data.reports.find((item) => item.id === reportId);
  if (!report) return <ClientPageError message="신고를 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader
      title={`${reportTargetLabel(report.targetType)} 신고`}
      status={<AdminStatusBadge label={reportStatusLabel(report.status)} tone={statusTone(report.status)} />}
      metadata={<span>같은 대상 누적 {formatNumber(report.cumulativeReportCount)}건</span>}
      actions={<div className="text-right"><p className="text-sm font-semibold">{reportReasonLabel(report.reason)}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">접수 {formatKoreaDateTime(report.createdAt)}</p></div>}
      actionsLabel="신고 접수 정보"
      className="flex-row items-start justify-between sm:items-start"
    />
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-xl border border-border/80 bg-card/35 p-5" aria-labelledby="content-title"><div className="flex items-center justify-between gap-3"><h2 id="content-title" className="text-sm font-semibold">신고 대상 원문</h2><AdminStatusBadge label={report.target?.moderationStatus === "HIDDEN" ? "숨김" : report.target?.moderationStatus === "VISIBLE" ? "노출" : "상태 미적용"} tone={statusTone(report.target?.moderationStatus ?? null)} /></div>{report.target?.title ? <h3 className="mt-5 text-base font-semibold">{report.target.title}</h3> : null}<p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">{report.target?.content || report.target?.emoticonKey || "원문을 찾을 수 없습니다."}</p></section>
      <aside className="space-y-5"><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">관련 사용자</h2><dl className="mt-3 space-y-3"><Detail label="작성자" value={<UserNickname nickname={report.target?.author?.nickname ?? "확인 불가"} teamId={report.target?.author?.teamId ?? null} />} /><Detail label="작성자 ID" value={report.target?.author?.id ?? "확인 불가"} mono /><Detail label="신고자" value={<UserNickname nickname={report.reporter?.nickname ?? "확인 불가"} teamId={report.reporter?.teamId ?? null} />} /><Detail label="신고자 ID" value={report.reporter?.id ?? "확인 불가"} mono /></dl></section><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">신고 상세</h2><dl className="mt-3 space-y-3"><Detail label="사유" value={reportReasonLabel(report.reason)} /><Detail label="추가 설명" value={report.details ?? "없음"} /><Detail label="대상 ID" value={report.targetId ?? "확인 불가"} mono /></dl>{!data.enhancementsReady ? <p className="mt-4 text-xs leading-5 text-warning">콘텐츠 숨김·복원과 사용자 경고·정지는 관리자 마이그레이션 적용 후 활성화됩니다.</p> : null}</section></aside>
    </div>
    {data.enhancementsReady && hasAdminPermission(admin.role, "moderation.write") ? <section className="mt-6 grid gap-5 lg:grid-cols-2" aria-label="신고 조치"><div className="rounded-xl border border-border/80 bg-card/35 p-5"><h2 className="text-sm font-semibold">신고 상태 처리</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">신고 상태와 메모를 저장합니다. 게시글 숨김은 ‘콘텐츠 숨김’ 버튼으로 처리합니다.</p><div className="mt-4"><ReportStatusForm reportId={report.id} status={report.status} /></div></div>{report.targetId ? <div className="rounded-xl border border-border/80 bg-card/35 p-5"><h2 className="text-sm font-semibold">콘텐츠 노출 조치</h2><p className="mt-1 text-xs text-muted-foreground">삭제하지 않고 숨김·복원합니다.</p><div className="mt-4"><ContentVisibilityForm reportId={report.id} targetType={report.targetType} targetId={report.targetId} hidden={report.target?.moderationStatus === "HIDDEN"} /></div></div> : null}</section> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) { return <div><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-all text-xs leading-5 ${mono ? "font-mono" : ""}`}>{value}</dd></div>; }

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { InquiryActionForm } from "@/components/admin/inquiry-action-form";
import { getSupportInquiryDetail } from "@/lib/admin/console-data";
import { inquiryStatusLabel, statusTone } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { formatKoreaDateTime } from "@/lib/format";

export default function InquiryDetailPage() {
  const admin = useRequiredAdminPermission("support.read");
  const inquiryId = useSearchParams().get("inquiryId") ?? "";
  const { data, error, loading, reload } = useClientData(
    () => getSupportInquiryDetail(inquiryId),
    [inquiryId],
  );
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "문의 데이터를 확인할 수 없습니다."} retry={reload} />;
  const inquiry = data.inquiry;
  if (!inquiry) return <ClientPageError message="문의를 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;
  return <div className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context={<Link href="/inquiries?tab=inquiries" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" />문의 내역</Link>} title={inquiry.subject} description={`${inquiry.requester?.nickname ?? "알 수 없는 사용자"} · ${inquiry.category}`} status={<AdminStatusBadge label={inquiryStatusLabel(inquiry.status)} tone={statusTone(inquiry.status)} />} metadata={<><span>접수 {formatKoreaDateTime(inquiry.createdAt)}</span><span>갱신 {formatKoreaDateTime(inquiry.updatedAt)}</span></>} />
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-xl border border-border/80 bg-card/35 p-5" aria-labelledby="original-title"><h2 id="original-title" className="text-sm font-semibold">문의 원문</h2><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">{inquiry.content}</p></section>
      <aside className="space-y-5"><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">요청자</h2><dl className="mt-3 space-y-3"><Detail label="닉네임" value={inquiry.requester?.nickname ?? "확인 불가"} /><Detail label="사용자 ID" value={inquiry.userId} mono /><Detail label="응원 팀" value={inquiry.requester?.teamName ?? "미선택"} /></dl></section><section className="rounded-xl border border-border/80 bg-card/35 p-4"><h2 className="text-sm font-semibold">현재 처리 내용</h2><dl className="mt-3 space-y-3"><Detail label="내부 메모" value={inquiry.adminNote ?? "기록 없음"} /><Detail label="사용자 답변" value={inquiry.answer ?? "답변 없음"} /><Detail label="답변 시각" value={inquiry.answeredAt ? formatKoreaDateTime(inquiry.answeredAt) : "해당 없음"} /></dl>{!data.enhancementsReady ? <p className="mt-4 text-xs leading-5 text-warning">관리자 답변 마이그레이션을 적용하면 이 화면에서 상태·메모·답변을 수정할 수 있습니다.</p> : null}</section></aside>
    </div>
    {data.enhancementsReady && hasAdminPermission(admin.role, "support.write") ? <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-5" aria-labelledby="inquiry-action-title"><h2 id="inquiry-action-title" className="text-sm font-semibold">문의 처리</h2><p className="mt-1 text-xs text-muted-foreground">답변과 내부 메모는 분리해 저장되며 모든 상태 변경은 감사 로그에 기록됩니다.</p><div className="mt-5 max-w-3xl"><InquiryActionForm inquiryId={inquiry.id} status={inquiry.status} answer={inquiry.answer} /></div></section> : null}
  </div>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className={`mt-1 whitespace-pre-wrap break-all text-xs leading-5 ${mono ? "font-mono" : ""}`}>{value}</dd></div>; }

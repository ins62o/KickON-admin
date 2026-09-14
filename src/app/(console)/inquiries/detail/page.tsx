"use client";

import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { InquiryActionForm } from "@/components/admin/inquiry-action-form";
import { getSupportInquiryDetail } from "@/lib/admin/console-data";
import { inquiryCategoryLabel, inquiryStatusLabel, statusTone } from "@/lib/admin/labels";
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
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader className="flex-row items-start justify-between gap-3 sm:items-start" title={inquiry.subject} actions={<AdminStatusBadge label={inquiryStatusLabel(inquiry.status)} tone={statusTone(inquiry.status)} />} actionsLabel="문의 상태" />
    <section className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/35 sm:mt-6 sm:p-5" aria-labelledby="request-title">
      <h2 id="request-title" className="border-b border-border/70 px-4 py-4 text-base font-semibold sm:border-0 sm:p-0">요청 내용</h2>
      <p className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-6 text-foreground/90 sm:mt-4 sm:p-0 sm:text-base sm:leading-7">{inquiry.content}</p>
      <dl className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 sm:mt-6 sm:gap-5 sm:bg-transparent sm:pt-5 xl:grid-cols-4">
        <Detail label="닉네임" value={inquiry.requester?.nickname ?? "확인 불가"} />
        <Detail label="접수 시간" value={formatKoreaDateTime(inquiry.createdAt)} />
        <Detail label="응원 팀" value={inquiry.requester?.teamName ?? "미선택"} />
        <Detail label="문의 종류" value={inquiryCategoryLabel(inquiry.category)} />
      </dl>
      {!data.enhancementsReady ? <p className="border-t border-border/70 px-4 py-3 text-xs leading-5 text-warning sm:mt-5 sm:border-0 sm:p-0">관리자 답변 마이그레이션을 적용하면 이 화면에서 상태·메모·답변을 수정할 수 있습니다.</p> : null}
    </section>
    {data.enhancementsReady && hasAdminPermission(admin.role, "support.write") ? <section className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/35 sm:mt-6 sm:p-5" aria-labelledby="inquiry-action-title"><h2 id="inquiry-action-title" className="border-b border-border/70 px-4 py-4 text-base font-semibold sm:border-0 sm:p-0">문의 답변</h2><div className="p-4 sm:mt-5 sm:p-0"><InquiryActionForm inquiryId={inquiry.id} answer={inquiry.answer} /></div></section> : null}
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0 bg-card px-4 py-3.5 sm:bg-transparent sm:p-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium leading-6">{value}</dd></div>; }

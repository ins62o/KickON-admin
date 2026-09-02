import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clock3, Headphones, Search } from "lucide-react";
import { DataState } from "@/components/admin/data-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSupportInquiryData } from "@/lib/admin/console-data";
import { inquiryStatusLabel, statusTone } from "@/lib/admin/labels";
import { requireAdminPermission } from "@/lib/auth/server";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "1:1 문의" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdminPermission("support.read");
  const query = await searchParams;
  const data = await getSupportInquiryData();
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const statusFilter = query.status === "open" ? ["RECEIVED", "IN_PROGRESS"] : query.status && query.status !== "all" ? [query.status] : null;
  const rows = data.inquiries.filter((inquiry) => {
    if (statusFilter && !statusFilter.includes(inquiry.status)) return false;
    if (keyword && ![inquiry.subject, inquiry.content, inquiry.requester?.nickname, inquiry.userId].filter(Boolean).some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))) return false;
    return true;
  });
  const received = data.inquiries.filter((item) => item.status === "RECEIVED").length;
  const inProgress = data.inquiries.filter((item) => item.status === "IN_PROGRESS").length;
  const answered = data.inquiries.filter((item) => item.status === "ANSWERED").length;

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context="SUPPORT" title="1:1 문의" description="문의 원문을 확인하고 처리 상태, 내부 메모와 사용자에게 보낼 답변을 관리합니다." status={!data.enhancementsReady ? <AdminStatusBadge label="답변 컬럼 적용 필요" tone="warning" /> : undefined} />
    {data.error ? <div className="mt-5"><DataState kind="unavailable" title="문의 데이터를 모두 읽지 못했습니다" description={data.error} compact /></div> : null}
    <MetricStrip className="mt-6" items={[
      { id: "received", label: "새 문의", value: `${formatNumber(received)}건`, icon: Headphones, tone: received > 0 ? "warning" : "success" },
      { id: "progress", label: "처리 중", value: `${formatNumber(inProgress)}건`, icon: Clock3, tone: inProgress > 0 ? "warning" : "neutral" },
      { id: "answered", label: "답변 완료", value: `${formatNumber(answered)}건`, icon: CheckCircle2, tone: "success" },
      { id: "shown", label: "현재 검색 결과", value: `${formatNumber(rows.length)}건`, icon: Search },
    ]} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="inquiry-list-title">
      <div className="border-b border-border/70 px-4 py-3.5"><h2 id="inquiry-list-title" className="text-sm font-semibold">문의 목록</h2><p className="mt-0.5 text-xs text-muted-foreground">접수일이 최근인 순서로 표시합니다.</p></div>
      <form className="grid gap-2 border-b border-border/70 p-3 sm:grid-cols-[minmax(240px,1fr)_180px_auto]" role="search"><Input name="q" defaultValue={query.q} placeholder="제목, 원문, 사용자 검색" aria-label="문의 검색" /><select name="status" defaultValue={query.status ?? "all"} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">모든 상태</option><option value="open">미처리 전체</option><option value="RECEIVED">접수</option><option value="IN_PROGRESS">처리 중</option><option value="ANSWERED">답변 완료</option><option value="CLOSED">종료</option></select><Button type="submit" size="sm"><Search className="size-3.5" />검색</Button></form>
      <div className="overflow-x-auto"><Table className="min-w-[980px]"><TableHeader><TableRow><TableHead>문의</TableHead><TableHead>사용자</TableHead><TableHead>분류</TableHead><TableHead>상태</TableHead><TableHead>접수</TableHead><TableHead>최근 변경</TableHead><TableHead className="text-right">처리</TableHead></TableRow></TableHeader><TableBody>{rows.length > 0 ? rows.map((inquiry) => <TableRow key={inquiry.id}><TableCell className="max-w-md"><p className="truncate text-xs font-medium">{inquiry.subject}</p><p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{inquiry.content}</p></TableCell><TableCell><p className="text-xs">{inquiry.requester?.nickname ?? "알 수 없음"}</p><p className="mt-0.5 max-w-40 truncate font-mono text-[10px] text-muted-foreground">{inquiry.userId}</p></TableCell><TableCell className="text-xs">{inquiry.category}</TableCell><TableCell><AdminStatusBadge label={inquiryStatusLabel(inquiry.status)} tone={statusTone(inquiry.status)} size="compact" /></TableCell><TableCell className="text-xs text-muted-foreground">{formatRelativeTime(inquiry.createdAt)}</TableCell><TableCell className="text-xs text-muted-foreground">{formatRelativeTime(inquiry.updatedAt)}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/inquiries/${inquiry.id}`}>열기<ArrowUpRight className="size-3.5" /></Link></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={7}><DataState kind="empty" title="조건에 맞는 문의가 없습니다" compact /></TableCell></TableRow>}</TableBody></Table></div>
    </section>
  </div>;
}

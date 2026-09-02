import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, EyeOff, Search, ShieldAlert } from "lucide-react";
import { DataState } from "@/components/admin/data-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getModerationData } from "@/lib/admin/console-data";
import { reportStatusLabel, reportTargetLabel, statusTone } from "@/lib/admin/labels";
import { requireAdminPermission } from "@/lib/auth/server";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "신고 및 커뮤니티 관리" };

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; target?: string }> }) {
  await requireAdminPermission("moderation.read");
  const query = await searchParams;
  const data = await getModerationData();
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const statuses = query.status === "open" ? ["OPEN", "REVIEWED"] : query.status && query.status !== "all" ? [query.status] : null;
  const rows = data.reports.filter((report) => {
    if (statuses && !statuses.includes(report.status)) return false;
    if (query.target && query.target !== "all" && report.targetType !== query.target) return false;
    if (keyword && ![report.reason, report.details, report.target?.title, report.target?.content, report.target?.author?.nickname, report.reporter?.nickname, report.targetId].filter(Boolean).some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))) return false;
    return true;
  });
  const open = data.reports.filter((item) => item.status === "OPEN").length;
  const reviewed = data.reports.filter((item) => item.status === "REVIEWED").length;
  const resolved = data.reports.filter((item) => item.status === "RESOLVED").length;
  const hidden = data.reports.filter((item) => item.target?.moderationStatus === "HIDDEN").length;

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context="TRUST & SAFETY" title="신고 및 커뮤니티 관리" description="신고 원문과 작성자·신고자·누적 횟수를 함께 검토하고, 삭제 대신 숨김·복원으로 관리합니다." status={!data.enhancementsReady ? <AdminStatusBadge label="숨김 스키마 적용 필요" tone="warning" /> : undefined} />
    {data.error ? <div className="mt-5"><DataState kind="unavailable" title="신고 대상을 모두 읽지 못했습니다" description={data.error} compact /></div> : null}
    <MetricStrip className="mt-6" items={[
      { id: "open", label: "새 신고", value: `${formatNumber(open)}건`, icon: ShieldAlert, tone: open > 0 ? "warning" : "success" },
      { id: "reviewed", label: "검토 중", value: `${formatNumber(reviewed)}건`, icon: Search, tone: reviewed > 0 ? "warning" : "neutral" },
      { id: "resolved", label: "조치 완료", value: `${formatNumber(resolved)}건`, icon: CheckCircle2, tone: "success" },
      { id: "hidden", label: "숨김 콘텐츠", value: `${formatNumber(hidden)}건`, icon: EyeOff, tone: hidden > 0 ? "danger" : "neutral" },
    ]} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="report-list-title">
      <div className="border-b border-border/70 px-4 py-3.5"><h2 id="report-list-title" className="text-sm font-semibold">신고 목록</h2><p className="mt-0.5 text-xs text-muted-foreground">대상 원문과 누적 신고 횟수를 먼저 확인하세요.</p></div>
      <form className="grid gap-2 border-b border-border/70 p-3 lg:grid-cols-[minmax(260px,1fr)_170px_170px_auto]" role="search"><Input name="q" defaultValue={query.q} placeholder="원문, 작성자, 신고 사유 검색" aria-label="신고 검색" /><select name="status" defaultValue={query.status ?? "all"} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">모든 처리 상태</option><option value="open">미처리 전체</option><option value="OPEN">접수</option><option value="REVIEWED">검토 중</option><option value="RESOLVED">조치 완료</option><option value="DISMISSED">기각</option></select><select name="target" defaultValue={query.target ?? "all"} className="h-9 rounded-md border border-input bg-background px-3 text-xs"><option value="all">모든 콘텐츠</option><option value="POST">게시글</option><option value="COMMENT">댓글</option><option value="FIXTURE_CHEER">경기 응원</option></select><Button type="submit" size="sm"><Search className="size-3.5" />검색</Button></form>
      <div className="overflow-x-auto"><Table className="min-w-[1180px]"><TableHeader><TableRow><TableHead>대상 원문</TableHead><TableHead>작성자</TableHead><TableHead>신고자</TableHead><TableHead>사유</TableHead><TableHead className="text-right">누적</TableHead><TableHead>콘텐츠 상태</TableHead><TableHead>처리 상태</TableHead><TableHead>접수</TableHead><TableHead className="text-right">검토</TableHead></TableRow></TableHeader><TableBody>{rows.length > 0 ? rows.map((report) => <TableRow key={report.id}><TableCell className="max-w-md"><p className="text-[10px] font-semibold text-primary">{reportTargetLabel(report.targetType)}</p><p className="mt-1 line-clamp-2 text-xs leading-5">{report.target?.title || report.target?.content || report.target?.emoticonKey || "원문을 찾을 수 없음"}</p></TableCell><TableCell className="text-xs">{report.target?.author?.nickname ?? "확인 불가"}</TableCell><TableCell className="text-xs">{report.reporter?.nickname ?? "확인 불가"}</TableCell><TableCell className="max-w-52"><p className="line-clamp-2 text-xs">{report.reason}</p></TableCell><TableCell className="text-right font-mono text-xs">{formatNumber(report.cumulativeReportCount)}</TableCell><TableCell><AdminStatusBadge label={report.target?.moderationStatus === "HIDDEN" ? "숨김" : report.target?.moderationStatus === "VISIBLE" ? "노출" : "미적용"} tone={statusTone(report.target?.moderationStatus ?? null)} size="compact" /></TableCell><TableCell><AdminStatusBadge label={reportStatusLabel(report.status)} tone={statusTone(report.status)} size="compact" /></TableCell><TableCell className="text-xs text-muted-foreground">{formatRelativeTime(report.createdAt)}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/moderation/${report.id}`}>열기<ArrowUpRight className="size-3.5" /></Link></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={9}><DataState kind="empty" title="조건에 맞는 신고가 없습니다" compact /></TableCell></TableRow>}</TableBody></Table></div>
    </section>
  </div>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Headphones, Search, ShieldAlert } from "lucide-react";

import { DataState } from "@/components/admin/data-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getModerationData,
  getSupportInquiryData,
  type AdminModerationData,
  type AdminSupportInquiryData,
} from "@/lib/admin/console-data";
import { reportTargetLabel, statusTone } from "@/lib/admin/labels";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { requireAdmin } from "@/lib/auth/server";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "문의 내역" };

type InquiryHistorySearchParams = {
  tab?: string;
  q?: string;
  status?: string;
  target?: string;
};

type HistoryStatus = "all" | "new" | "answered";

const inquiryAnsweredStatuses = new Set(["ANSWERED", "CLOSED"]);
const reportAnsweredStatuses = new Set(["RESOLVED", "DISMISSED"]);

function normalizedHistoryStatus(status: string | undefined): HistoryStatus {
  if (["new", "open", "RECEIVED", "IN_PROGRESS", "OPEN", "REVIEWED"].includes(status ?? "")) {
    return "new";
  }
  if (["answered", "ANSWERED", "CLOSED", "RESOLVED", "DISMISSED"].includes(status ?? "")) {
    return "answered";
  }
  return "all";
}

function HistoryStatusBadge({ answered }: { answered: boolean }) {
  return (
    <AdminStatusBadge
      label={answered ? "답변 완료" : "새 문의"}
      tone={answered ? "success" : "info"}
      size="compact"
    />
  );
}

function InquiryHistoryPanel({
  data,
  query,
}: {
  data: AdminSupportInquiryData;
  query: InquiryHistorySearchParams;
}) {
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const statusFilter = normalizedHistoryStatus(query.status);
  const rows = data.inquiries.filter((inquiry) => {
    const answered = inquiryAnsweredStatuses.has(inquiry.status);
    if (statusFilter === "new" && answered) return false;
    if (statusFilter === "answered" && !answered) return false;
    if (
      keyword &&
      ![inquiry.subject, inquiry.content, inquiry.requester?.nickname, inquiry.userId]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))
    ) return false;
    return true;
  });
  const answeredCount = data.inquiries.filter((inquiry) => inquiryAnsweredStatuses.has(inquiry.status)).length;
  const newCount = data.inquiries.length - answeredCount;

  return (
    <div className="space-y-5">
      {data.error ? (
        <DataState kind="unavailable" title="문의 데이터를 모두 읽지 못했습니다" description={data.error} compact />
      ) : null}

      <MetricStrip
        ariaLabel="1:1 문의 상태"
        items={[
          { id: "new", label: "새 문의", value: `${formatNumber(newCount)}건`, icon: Headphones, tone: newCount > 0 ? "warning" : "success" },
          { id: "answered", label: "답변 완료", value: `${formatNumber(answeredCount)}건`, icon: CheckCircle2, tone: "success" },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="inquiry-list-title">
        <div className="border-b border-border/70 px-4 py-3.5">
          <h2 id="inquiry-list-title" className="text-sm font-semibold">1:1 문의 내역</h2>
        </div>
        <form className="grid gap-2 border-b border-border/70 p-3 sm:grid-cols-[minmax(240px,1fr)_180px_auto]" role="search">
          <input type="hidden" name="tab" value="inquiries" />
          <Input name="q" defaultValue={query.q} placeholder="제목, 원문, 사용자 검색" aria-label="1:1 문의 검색" />
          <Select name="status" defaultValue={statusFilter}>
            <SelectTrigger className="h-9! w-full" aria-label="1:1 문의 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 상태</SelectItem>
              <SelectItem value="new">새 문의</SelectItem>
              <SelectItem value="answered">답변 완료</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" size="sm">
            <Search className="size-3.5" aria-hidden="true" />
            검색
          </Button>
        </form>
        <div className="overflow-x-auto">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>문의</TableHead>
                <TableHead>사용자</TableHead>
                <TableHead>분류</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>접수</TableHead>
                <TableHead>최근 변경</TableHead>
                <TableHead className="text-right">처리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map((inquiry) => (
                <TableRow key={inquiry.id}>
                  <TableCell className="max-w-md">
                    <p className="truncate text-xs font-medium">{inquiry.subject}</p>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{inquiry.content}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs">{inquiry.requester?.nickname ?? "알 수 없음"}</p>
                    <p className="mt-0.5 max-w-40 truncate font-mono text-[10px] text-muted-foreground">{inquiry.userId}</p>
                  </TableCell>
                  <TableCell className="text-xs">{inquiry.category}</TableCell>
                  <TableCell><HistoryStatusBadge answered={inquiryAnsweredStatuses.has(inquiry.status)} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(inquiry.createdAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(inquiry.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/inquiries/${inquiry.id}`}>
                        열기
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={7}><DataState kind="empty" title="조건에 맞는 문의가 없습니다" compact /></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function ReportHistoryPanel({
  data,
  query,
}: {
  data: AdminModerationData;
  query: InquiryHistorySearchParams;
}) {
  const keyword = query.q?.trim().toLocaleLowerCase("ko-KR") ?? "";
  const statusFilter = normalizedHistoryStatus(query.status);
  const targetFilter = query.target && ["POST", "COMMENT", "FIXTURE_CHEER"].includes(query.target)
    ? query.target
    : "all";
  const rows = data.reports.filter((report) => {
    const answered = reportAnsweredStatuses.has(report.status);
    if (statusFilter === "new" && answered) return false;
    if (statusFilter === "answered" && !answered) return false;
    if (targetFilter !== "all" && report.targetType !== targetFilter) return false;
    if (
      keyword &&
      ![
        report.reason,
        report.details,
        report.target?.title,
        report.target?.content,
        report.target?.author?.nickname,
        report.reporter?.nickname,
        report.targetId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko-KR").includes(keyword))
    ) return false;
    return true;
  });
  const answeredCount = data.reports.filter((report) => reportAnsweredStatuses.has(report.status)).length;
  const newCount = data.reports.length - answeredCount;

  return (
    <div className="space-y-5">
      {data.error ? (
        <DataState kind="unavailable" title="신고 데이터를 모두 읽지 못했습니다" description={data.error} compact />
      ) : null}

      <MetricStrip
        ariaLabel="신고 문의 상태"
        items={[
          { id: "new", label: "새 문의", value: `${formatNumber(newCount)}건`, icon: ShieldAlert, tone: newCount > 0 ? "warning" : "success" },
          { id: "answered", label: "답변 완료", value: `${formatNumber(answeredCount)}건`, icon: CheckCircle2, tone: "success" },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="report-list-title">
        <div className="border-b border-border/70 px-4 py-3.5">
          <h2 id="report-list-title" className="text-sm font-semibold">신고 내역</h2>
        </div>
        <form className="grid gap-2 border-b border-border/70 p-3 lg:grid-cols-[minmax(260px,1fr)_170px_170px_auto]" role="search">
          <input type="hidden" name="tab" value="reports" />
          <Input name="q" defaultValue={query.q} placeholder="원문, 작성자, 신고 사유 검색" aria-label="신고 검색" />
          <Select name="status" defaultValue={statusFilter}>
            <SelectTrigger className="h-9! w-full" aria-label="신고 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 상태</SelectItem>
              <SelectItem value="new">새 문의</SelectItem>
              <SelectItem value="answered">답변 완료</SelectItem>
            </SelectContent>
          </Select>
          <Select name="target" defaultValue={targetFilter}>
            <SelectTrigger className="h-9! w-full" aria-label="신고 콘텐츠 유형">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 콘텐츠</SelectItem>
              <SelectItem value="POST">게시글</SelectItem>
              <SelectItem value="COMMENT">댓글</SelectItem>
              <SelectItem value="FIXTURE_CHEER">경기 응원</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" size="sm">
            <Search className="size-3.5" aria-hidden="true" />
            검색
          </Button>
        </form>
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead>대상 원문</TableHead>
                <TableHead>작성자</TableHead>
                <TableHead>신고자</TableHead>
                <TableHead>사유</TableHead>
                <TableHead className="text-right">누적</TableHead>
                <TableHead>콘텐츠 상태</TableHead>
                <TableHead>처리 상태</TableHead>
                <TableHead>접수</TableHead>
                <TableHead className="text-right">검토</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="max-w-md">
                    <p className="text-[10px] font-semibold text-primary">{reportTargetLabel(report.targetType)}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5">
                      {report.target?.title || report.target?.content || report.target?.emoticonKey || "원문을 찾을 수 없음"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{report.target?.author?.nickname ?? "확인 불가"}</TableCell>
                  <TableCell className="text-xs">{report.reporter?.nickname ?? "확인 불가"}</TableCell>
                  <TableCell className="max-w-52"><p className="line-clamp-2 text-xs">{report.reason}</p></TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(report.cumulativeReportCount)}</TableCell>
                  <TableCell>
                    <AdminStatusBadge
                      label={report.target?.moderationStatus === "HIDDEN" ? "숨김" : report.target?.moderationStatus === "VISIBLE" ? "노출" : "미적용"}
                      tone={statusTone(report.target?.moderationStatus ?? null)}
                      size="compact"
                    />
                  </TableCell>
                  <TableCell><HistoryStatusBadge answered={reportAnsweredStatuses.has(report.status)} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatRelativeTime(report.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/moderation/${report.id}`}>
                        열기
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={9}><DataState kind="empty" title="조건에 맞는 신고가 없습니다" compact /></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<InquiryHistorySearchParams>;
}) {
  const admin = await requireAdmin();
  const canReadInquiries = hasAdminPermission(admin.role, "support.read");
  const canReadReports = hasAdminPermission(admin.role, "moderation.read");

  if (!canReadInquiries && !canReadReports) redirect("/?reason=forbidden");

  const [query, inquiryData, reportData] = await Promise.all([
    searchParams,
    canReadInquiries ? getSupportInquiryData() : Promise.resolve(null),
    canReadReports ? getModerationData() : Promise.resolve(null),
  ]);
  const activeTab = query.tab === "reports" && canReadReports
    ? "reports"
    : canReadInquiries
      ? "inquiries"
      : "reports";

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title="문의 내역" />

      <Tabs key={activeTab} defaultValue={activeTab} className="mt-6 gap-5">
        <TabsList variant="line" className="h-11 w-full justify-start gap-2 border-b border-border/70 p-0" aria-label="문의 내역 유형">
          {canReadInquiries ? (
            <TabsTrigger value="inquiries" className="h-11 flex-none px-4 sm:px-6">
              <Headphones className="size-4" aria-hidden="true" />
              1:1 문의 내역
            </TabsTrigger>
          ) : null}
          {canReadReports ? (
            <TabsTrigger value="reports" className="h-11 flex-none px-4 sm:px-6">
              <ShieldAlert className="size-4" aria-hidden="true" />
              신고 내역
            </TabsTrigger>
          ) : null}
        </TabsList>

        {inquiryData ? (
          <TabsContent value="inquiries"><InquiryHistoryPanel data={inquiryData} query={query} /></TabsContent>
        ) : null}
        {reportData ? (
          <TabsContent value="reports"><ReportHistoryPanel data={reportData} query={query} /></TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

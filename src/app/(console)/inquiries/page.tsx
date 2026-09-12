"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Headphones, ShieldAlert } from "lucide-react";

import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { DataState } from "@/components/admin/data-state";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
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
import { inquiryCategoryLabels, reportTargetLabel } from "@/lib/admin/labels";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { formatKoreaReadableDateTime, formatNumber } from "@/lib/format";

type InquiryHistorySearchParams = {
  tab?: string;
  q?: string;
  status?: string;
  category?: string;
  target?: string;
};

type HistoryStatus = "all" | "new" | "answered";

const inquiryAnsweredStatuses = new Set(["ANSWERED", "CLOSED"]);
const reportAnsweredStatuses = new Set(["RESOLVED", "DISMISSED"]);
const inquiryCategories = Object.entries(inquiryCategoryLabels);

function normalizedHistoryStatus(status: string | undefined): HistoryStatus {
  if (["new", "open", "RECEIVED", "IN_PROGRESS", "OPEN", "REVIEWED"].includes(status ?? "")) {
    return "new";
  }
  if (["answered", "ANSWERED", "CLOSED", "RESOLVED", "DISMISSED"].includes(status ?? "")) {
    return "answered";
  }
  return "all";
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
  const categoryFilter = query.category && query.category in inquiryCategoryLabels
    ? query.category
    : "all";
  const rows = data.inquiries.filter((inquiry) => {
    const answered = inquiryAnsweredStatuses.has(inquiry.status);
    if (statusFilter === "new" && answered) return false;
    if (statusFilter === "answered" && !answered) return false;
    if (categoryFilter !== "all" && inquiry.category !== categoryFilter) return false;
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
        layout="inline"
        items={[
          { id: "new", label: "새 문의", value: `${formatNumber(newCount)}건`, icon: Headphones, tone: "accent" },
          { id: "answered", label: "답변 완료", value: `${formatNumber(answeredCount)}건`, icon: CheckCircle2, tone: "success" },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="inquiry-list-title">
        <div className="border-b border-border/70 px-5 py-4">
          <h2 id="inquiry-list-title" className="text-base font-semibold">문의 내역</h2>
        </div>
        <form className="grid gap-3 border-b border-border/70 p-4 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto]" role="search">
          <input type="hidden" name="tab" value="inquiries" />
          <Input
            name="q"
            defaultValue={query.q}
            placeholder="제목, 원문, 사용자 검색"
            aria-label="1:1 문의 검색"
            className="h-11 rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm shadow-inner shadow-black/5 dark:bg-muted/35"
          />
          <Select name="status" defaultValue={statusFilter}>
            <SelectTrigger className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="1:1 문의 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
              <SelectItem value="all" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                모든 상태
              </SelectItem>
              <SelectItem value="new" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                새 문의
              </SelectItem>
              <SelectItem value="answered" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                답변 완료
              </SelectItem>
            </SelectContent>
          </Select>
          <Select name="category" defaultValue={categoryFilter}>
            <SelectTrigger className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="문의 분류">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
              <SelectItem value="all" className="cursor-pointer py-2.5 pr-8 pl-2.5">분류</SelectItem>
              {inquiryCategories.map(([value, label]) => (
                <SelectItem key={value} value={value} className="cursor-pointer py-2.5 pr-8 pl-2.5">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" className="h-11 rounded-xl px-5 text-sm">
            검색
          </Button>
        </form>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">분류</TableHead>
                <TableHead className="px-4">제목</TableHead>
                <TableHead className="px-4">사용자</TableHead>
                <TableHead className="px-4">접수 날짜</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map((inquiry) => (
                <TableRow key={inquiry.id}>
                  <TableCell className="w-44 px-4 py-4 text-sm text-muted-foreground">
                    {inquiryCategoryLabels[inquiry.category as keyof typeof inquiryCategoryLabels] ?? inquiry.category}
                  </TableCell>
                  <TableCell className="max-w-xl px-4 py-4">
                    <Link
                      href={`/inquiries/detail/?inquiryId=${encodeURIComponent(inquiry.id)}`}
                      className="block cursor-pointer truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {inquiry.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="w-52 px-4 py-4 text-sm">
                    {inquiry.requester?.nickname ?? "알 수 없음"}
                  </TableCell>
                  <TableCell className="w-52 px-4 py-4 text-sm text-muted-foreground">
                    {formatKoreaReadableDateTime(inquiry.createdAt)}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4}><DataState kind="empty" title="조건에 맞는 문의가 없습니다" hideDescription compact /></TableCell>
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
        ariaLabel="신고 처리 상태"
        layout="inline"
        items={[
          { id: "new", label: "새 신고", value: `${formatNumber(newCount)}건`, icon: ShieldAlert, tone: "accent" },
          { id: "answered", label: "처리 완료", value: `${formatNumber(answeredCount)}건`, icon: CheckCircle2, tone: "success" },
        ]}
      />

      <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="report-list-title">
        <div className="border-b border-border/70 px-5 py-4">
          <h2 id="report-list-title" className="text-base font-semibold">신고 내역</h2>
        </div>
        <form className="grid gap-3 border-b border-border/70 p-4 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto]" role="search">
          <input type="hidden" name="tab" value="reports" />
          <Input
            name="q"
            defaultValue={query.q}
            placeholder="원문, 작성자, 신고 사유 검색"
            aria-label="신고 검색"
            className="h-11 rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm shadow-inner shadow-black/5 dark:bg-muted/35"
          />
          <Select name="status" defaultValue={statusFilter}>
            <SelectTrigger className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="신고 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
              <SelectItem value="all" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                모든 상태
              </SelectItem>
              <SelectItem value="new" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                새 문의
              </SelectItem>
              <SelectItem value="answered" className="cursor-pointer py-2.5 pr-8 pl-2.5">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                답변 완료
              </SelectItem>
            </SelectContent>
          </Select>
          <Select name="target" defaultValue={targetFilter}>
            <SelectTrigger className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="신고 분류">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
              <SelectItem value="all" className="cursor-pointer py-2.5 pr-8 pl-2.5">분류</SelectItem>
              <SelectItem value="POST" className="cursor-pointer py-2.5 pr-8 pl-2.5">게시글</SelectItem>
              <SelectItem value="COMMENT" className="cursor-pointer py-2.5 pr-8 pl-2.5">댓글</SelectItem>
              <SelectItem value="FIXTURE_CHEER" className="cursor-pointer py-2.5 pr-8 pl-2.5">경기 응원</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" className="h-11 rounded-xl px-5 text-sm">
            검색
          </Button>
        </form>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">분류</TableHead>
                <TableHead className="px-4">제목</TableHead>
                <TableHead className="px-4">사용자</TableHead>
                <TableHead className="px-4">접수 날짜</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? rows.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className="w-44 px-4 py-4 text-sm text-muted-foreground">
                    {reportTargetLabel(report.targetType)}
                  </TableCell>
                  <TableCell className="max-w-xl px-4 py-4">
                    <Link
                      href={`/moderation/detail/?reportId=${encodeURIComponent(report.id)}`}
                      className="block cursor-pointer truncate text-sm font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {report.target?.title || report.target?.content || report.target?.emoticonKey || "원문을 찾을 수 없음"}
                    </Link>
                  </TableCell>
                  <TableCell className="w-52 px-4 py-4 text-sm">
                    {report.reporter?.nickname ?? "확인 불가"}
                  </TableCell>
                  <TableCell className="w-52 px-4 py-4 text-sm text-muted-foreground">
                    {formatKoreaReadableDateTime(report.createdAt)}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4}><DataState kind="empty" title="조건에 맞는 신고가 없습니다" hideDescription compact /></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

export default function InquiriesPage() {
  const { admin } = useAdminAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canReadInquiries = Boolean(admin && hasAdminPermission(admin.role, "support.read"));
  const canReadReports = Boolean(admin && hasAdminPermission(admin.role, "moderation.read"));

  useEffect(() => {
    if (!canReadInquiries && !canReadReports) router.replace("/?reason=forbidden");
  }, [canReadInquiries, canReadReports, router]);

  const { data, error, loading, reload } = useClientData(async () => {
    const [inquiryData, reportData] = await Promise.all([
      canReadInquiries ? getSupportInquiryData() : Promise.resolve(null),
      canReadReports ? getModerationData() : Promise.resolve(null),
    ]);
    return { inquiryData, reportData };
  }, [canReadInquiries, canReadReports]);
  if (!canReadInquiries && !canReadReports) return <ClientPageLoading label="접근 권한을 확인하고 있습니다." />;
  if (loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "문의·신고 데이터를 확인할 수 없습니다."} retry={reload} />;
  const query: InquiryHistorySearchParams = {
    tab: searchParams.get("tab") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    target: searchParams.get("target") ?? undefined,
  };
  const { inquiryData, reportData } = data;
  const activeTab = query.tab === "reports" && canReadReports
    ? "reports"
    : canReadInquiries
      ? "inquiries"
      : "reports";

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title="문의 신고" />

      <Tabs key={activeTab} defaultValue={activeTab} className="mt-6 gap-5">
        <TabsList
          className={`grid! h-16! w-full ${canReadInquiries && canReadReports ? "grid-cols-2" : "grid-cols-1"} gap-1.5 rounded-xl border border-border/80 bg-card/45 p-1.5`}
          aria-label="문의 내역 유형"
        >
          {canReadInquiries ? (
            <TabsTrigger value="inquiries" className="h-full! w-full cursor-pointer rounded-lg border-transparent text-base font-semibold data-active:border-transparent data-active:bg-primary/10 data-active:text-primary data-active:shadow-none data-active:ring-1 data-active:ring-inset data-active:ring-primary/20 dark:data-active:border-transparent">
              문의 내역
            </TabsTrigger>
          ) : null}
          {canReadReports ? (
            <TabsTrigger value="reports" className="h-full! w-full cursor-pointer rounded-lg border-transparent text-base font-semibold data-active:border-transparent data-active:bg-primary/10 data-active:text-primary data-active:shadow-none data-active:ring-1 data-active:ring-inset data-active:ring-primary/20 dark:data-active:border-transparent">
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

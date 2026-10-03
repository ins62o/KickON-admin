"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { ACTIVITY_PAGE_SIZE } from "@/lib/admin/activity-records";
import { formatNumber } from "@/lib/format";

export function activityListHref(base: string, page: number, query: string, teamId = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query) params.set("q", query);
  if (teamId) params.set("team", teamId);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

export function ActivityHistory({ title, base, total, page, query, placeholder, showTotal = true, showDashboardLink = true, teamId = "", filters, children }: {
  title: string; base: string; total: number; page: number; query: string; placeholder: string; showTotal?: boolean; showDashboardLink?: boolean; teamId?: string; filters?: ReactNode; children: ReactNode;
}) {
  const router = useRouter();
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title={title} className={showTotal ? "flex-row items-center justify-between sm:items-center" : undefined} context={showDashboardLink ? <Link href="/" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="size-3" />대시보드</Link> : undefined} actions={showTotal ? <span className="tabular text-sm text-muted-foreground">{query || teamId ? "검색 결과" : "전체"} {formatNumber(total)}건</span> : undefined} actionsLabel="조회 건수" />
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-label={`${title} 목록`}>
        <form className="flex flex-wrap gap-3 border-b border-border/70 p-4" role="search" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const keyword = String(form.get("q") ?? "").trim().slice(0, 200);
          const selectedTeam = String(form.get("team") ?? "");
          router.push(activityListHref(base, 1, keyword, selectedTeam === "all" ? "" : selectedTeam));
        }}>
          {filters}
          <SearchInput key={query} containerClassName="min-w-0 flex-1 basis-40" name="q" defaultValue={query} placeholder={placeholder} aria-label={`${title} 검색`} maxLength={200} />
          <Button type="submit" className="h-11 shrink-0 px-5">검색</Button>
        </form>
        {total === 0 ? <p className="px-5 py-16 text-center text-sm text-muted-foreground">{query || teamId ? "검색 조건에 맞는 내역이 없습니다." : "등록된 내역이 없습니다."}</p> : children}
        <nav aria-label={`${title} 페이지`} className="flex items-center justify-between gap-3 border-t border-border/70 p-4">
          {page > 1 ? <Button asChild variant="outline" className="h-11"><Link href={activityListHref(base, page - 1, query, teamId)}><ChevronLeft className="size-4" />이전</Link></Button> : <Button disabled variant="outline" className="h-11"><ChevronLeft className="size-4" />이전</Button>}
          <span className="tabular text-xs text-muted-foreground">{formatNumber(page)} / {formatNumber(pages)}</span>
          {page < pages ? <Button asChild variant="outline" className="h-11"><Link href={activityListHref(base, page + 1, query, teamId)}>다음<ChevronRight className="size-4" /></Link></Button> : <Button disabled variant="outline" className="h-11">다음<ChevronRight className="size-4" /></Button>}
        </nav>
      </section>
    </div>
  );
}

export function ActivityDetailField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 bg-card px-4 py-3.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium [overflow-wrap:anywhere]">{children}</dd></div>;
}

export function ActivityLoading() {
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="상세 내역을 불러오는 중"><Skeleton className="h-9 w-40" /><div className="mt-6 space-y-3 rounded-xl border border-border/80 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />)}</div></div>;
}

import { GaugeCardsSkeleton, PageTitleSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataManagementLoading() {
  return (
    <SkeletonFrame label="데이터 관리 정보를 불러오는 중">
      <PageTitleSkeleton titleWidth="w-28" />
      <section className="mt-6"><div className="mb-3 flex items-center gap-2"><Skeleton className="size-4" /><Skeleton className="h-5 w-24" /></div><div className="md:overflow-x-auto"><div className="grid grid-cols-2 gap-2 md:min-w-[1260px] md:grid-cols-7 md:gap-px md:overflow-hidden md:rounded-xl md:border md:border-border/80 md:bg-border/70">{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className={`h-28 rounded-lg md:h-36 md:rounded-none ${index === 6 ? "col-span-2 md:col-span-1" : ""}`} />)}</div></div></section>
      <section className="mt-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 md:hidden">{Array.from({ length: 3 }).map((_, index) => <div key={index} className={`min-h-44 bg-card p-3.5 ${index === 2 ? "col-span-2" : ""}`}><div className="flex items-center justify-between"><Skeleton className="size-8 rounded-md" /><Skeleton className="h-6 w-14 rounded-md" /></div><Skeleton className="mt-3 h-4 w-24" /><Skeleton className="mt-2 h-7 w-20" /><Skeleton className="mt-5 h-1.5 w-full rounded-full" /></div>)}</div>
        <div className="hidden md:block"><GaugeCardsSkeleton count={3} /></div>
      </section>
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35"><div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4"><Skeleton className="h-5 w-24" /><Skeleton className="h-4 w-28" /></div><div className="divide-y divide-border/70 md:hidden">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-5 w-14 rounded-md" /></div><div className="mt-2 flex justify-between gap-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-20" /></div><Skeleton className="mt-3 h-3 w-3/4" /></div>)}</div><div className="hidden md:block"><TableSkeleton rows={8} columns={6} minWidth="min-w-[1100px]" /></div></section>
    </SkeletonFrame>
  );
}

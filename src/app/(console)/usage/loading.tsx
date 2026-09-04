import { DataManagementNavSkeleton, GaugeCardsSkeleton, MetricCardsSkeleton, PanelSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsageLoading() {
  return (
    <SkeletonFrame label="사용량과 시스템 상태를 불러오는 중">
      <DataManagementNavSkeleton />
      <header className="mt-6 flex items-end justify-between gap-4"><div><Skeleton className="h-8 w-44" /><Skeleton className="mt-2 h-4 w-72 max-w-full" /></div><Skeleton className="h-4 w-28" /></header>
      <section className="mt-6"><GaugeCardsSkeleton count={3} /></section>
      <PanelSkeleton className="mt-6" titleWidth="w-40" description>
        <div className="p-4"><MetricCardsSkeleton count={4} /><div className="mt-4 grid gap-4 xl:grid-cols-2"><div className="rounded-lg border border-border/70"><TableSkeleton rows={5} columns={5} minWidth="min-w-[680px]" /></div><Skeleton className="h-64 rounded-lg" /></div></div>
      </PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-28"><MetricCardsSkeleton count={4} className="rounded-none border-0" /></PanelSkeleton>
      <div className="mt-6 grid gap-6 xl:grid-cols-2"><PanelSkeleton titleWidth="w-32"><TableSkeleton rows={5} columns={3} /></PanelSkeleton><PanelSkeleton titleWidth="w-36"><TableSkeleton rows={5} columns={5} minWidth="min-w-[820px]" /></PanelSkeleton></div>
    </SkeletonFrame>
  );
}

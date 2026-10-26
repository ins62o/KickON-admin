import { DataManagementNavSkeleton, MetricCardsSkeleton, PanelSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <SkeletonFrame label="관리자 변경 기록을 불러오는 중">
      <DataManagementNavSkeleton />
      <header className="mt-6 flex items-end justify-between gap-4"><div><Skeleton className="h-8 w-44" /><Skeleton className="mt-2 h-4 w-72 max-w-full" /></div><Skeleton className="h-7 w-20 rounded-md" /></header>
      <section className="mt-6 border-y border-border/80 bg-card/20 px-5 py-5"><div className="flex items-start gap-3"><Skeleton className="size-9 rounded-lg" /><div className="flex-1"><Skeleton className="h-4 w-52" /><Skeleton className="mt-2 h-3 w-96 max-w-full" /></div></div></section>
      <section className="mt-6"><MetricCardsSkeleton count={4} /></section>
      <PanelSkeleton className="mt-6" titleWidth="w-28" action><TableSkeleton rows={9} columns={6} minWidth="min-w-[1100px]" /></PanelSkeleton>
    </SkeletonFrame>
  );
}

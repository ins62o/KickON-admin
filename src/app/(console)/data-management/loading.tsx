import { GaugeCardsSkeleton, PanelSkeleton, PageTitleSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function DataManagementLoading() {
  return (
    <SkeletonFrame label="데이터 관리 정보를 불러오는 중">
      <PageTitleSkeleton titleWidth="w-28" />
      <section className="mt-6"><div className="mb-3 flex items-center gap-2"><Skeleton className="size-4" /><Skeleton className="h-5 w-24" /></div><PanelSkeleton titleWidth="w-28" description><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}</div></PanelSkeleton></section>
      <section className="mt-6"><GaugeCardsSkeleton count={3} /></section>
      <PanelSkeleton className="mt-6" titleWidth="w-24" action><TableSkeleton rows={8} columns={6} minWidth="min-w-[1100px]" /></PanelSkeleton>
    </SkeletonFrame>
  );
}

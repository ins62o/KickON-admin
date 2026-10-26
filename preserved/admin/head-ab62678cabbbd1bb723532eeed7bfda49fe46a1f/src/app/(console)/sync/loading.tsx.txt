import { DataManagementNavSkeleton, FilterSkeleton, PanelSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function SyncLoading() {
  return (
    <SkeletonFrame label="데이터 동기화 정보를 불러오는 중">
      <DataManagementNavSkeleton />
      <header className="mt-6 flex items-end justify-between gap-4"><div><Skeleton className="h-8 w-40" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div><Skeleton className="h-7 w-20 rounded-md" /></header>
      <PanelSkeleton className="mt-6" titleWidth="w-24" description>
        <FilterSkeleton count={3} />
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-lg" />)}</div>
      </PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-36" description><TableSkeleton rows={7} columns={3} minWidth="min-w-[720px]" /></PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-32" description><TableSkeleton rows={6} columns={5} minWidth="min-w-[900px]" /></PanelSkeleton>
    </SkeletonFrame>
  );
}

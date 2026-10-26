import { DetailHeaderSkeleton, PanelSkeleton, SkeletonFrame, TableSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuditDetailLoading() {
  return (
    <SkeletonFrame label="변경 기록 상세를 불러오는 중" maxWidth="max-w-[1380px]">
      <DetailHeaderSkeleton />
      <section className="mt-6 border-y border-border/80 bg-card/20 px-5 py-5"><div className="flex gap-3"><Skeleton className="size-9 rounded-lg" /><div className="flex-1"><Skeleton className="h-3 w-36" /><Skeleton className="mt-2 h-5 w-72 max-w-full" /><Skeleton className="mt-2 h-3 w-full max-w-xl" /></div></div></section>
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"><PanelSkeleton titleWidth="w-20"><div className="p-4"><Skeleton className="h-4 w-full" /><Skeleton className="mt-3 h-4 w-2/3" /></div></PanelSkeleton><PanelSkeleton titleWidth="w-28"><div className="space-y-4 p-4">{Array.from({ length: 3 }).map((_, index) => <div key={index}><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-28" /></div>)}</div></PanelSkeleton></div>
      <PanelSkeleton className="mt-6" titleWidth="w-28" description action><TableSkeleton rows={5} columns={4} minWidth="min-w-[860px]" /></PanelSkeleton>
      <div className="mt-6 grid gap-4 xl:grid-cols-2">{Array.from({ length: 2 }).map((_, index) => <PanelSkeleton key={index} titleWidth="w-32"><Skeleton className="m-4 h-32" /></PanelSkeleton>)}</div>
    </SkeletonFrame>
  );
}

import { FormSkeleton, MetricCardsSkeleton, PanelSkeleton, SkeletonFrame } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerDetailLoading() {
  return (
    <SkeletonFrame label="선수 상세 정보를 불러오는 중">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><Skeleton className="h-8 w-48" /><Skeleton className="mt-2 h-4 w-72 max-w-full" /></div><Skeleton className="h-10 w-28 rounded-lg" /></header>
      <section className="mt-7"><MetricCardsSkeleton count={4} /></section>
      <PanelSkeleton className="mt-6" titleWidth="w-28"><div className="grid gap-px bg-border/70 sm:grid-cols-2">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="bg-card/45 px-5 py-5"><Skeleton className="h-4 w-20" /><Skeleton className="mt-2 h-5 w-36 max-w-full" /></div>)}</div></PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-24" description><FormSkeleton fields={6} /></PanelSkeleton>
    </SkeletonFrame>
  );
}

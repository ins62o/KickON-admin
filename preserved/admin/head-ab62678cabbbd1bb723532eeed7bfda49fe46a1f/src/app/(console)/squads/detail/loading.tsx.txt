import { PanelSkeleton, SkeletonFrame } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerDetailLoading() {
  return (
    <SkeletonFrame label="선수 상세 정보를 불러오는 중">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><Skeleton className="h-8 w-48" /><Skeleton className="mt-2 h-3 w-32 sm:hidden" /></div><div className="grid w-full grid-cols-2 gap-2 sm:w-72"><Skeleton className="h-11 rounded-lg" /><Skeleton className="h-11 rounded-lg" /></div></header>
      <section className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:mt-7 sm:gap-3 sm:border-0 sm:bg-transparent xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <article key={index} className="min-h-24 bg-card/45 p-3.5 sm:rounded-xl sm:border sm:border-border/80 sm:p-4"><Skeleton className="h-3 w-14" /><Skeleton className="mt-2 h-6 w-16" /></article>)}</section>
      <PanelSkeleton className="mt-5 sm:mt-6" titleWidth="w-28"><div className="grid gap-px bg-border/70 sm:grid-cols-2">{Array.from({ length: 10 }).map((_, index) => <div key={index} className="flex items-start justify-between gap-4 bg-card/45 px-4 py-3.5 sm:block sm:px-5 sm:py-5"><Skeleton className="h-3 w-16 sm:h-4 sm:w-20" /><Skeleton className="h-4 w-28 max-w-[60%] sm:mt-2 sm:h-5 sm:w-36 sm:max-w-full" /></div>)}</div></PanelSkeleton>
    </SkeletonFrame>
  );
}

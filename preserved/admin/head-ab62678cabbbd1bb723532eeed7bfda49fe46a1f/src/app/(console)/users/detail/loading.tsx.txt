import { SkeletonFrame } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserDetailLoading() {
  return (
    <SkeletonFrame label="사용자 상세 정보를 불러오는 중" maxWidth="max-w-[1720px]">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-center gap-3"><Skeleton className="size-12 shrink-0 rounded-xl sm:size-10 sm:rounded-lg" /><div className="min-w-0"><Skeleton className="h-7 w-28" /><Skeleton className="mt-2 h-3 w-20 sm:hidden" /></div></div>
        <div className="grid grid-cols-2 gap-2 sm:flex"><Skeleton className="h-11 rounded-lg sm:w-24" /><Skeleton className="h-11 rounded-lg sm:w-24" /></div>
      </header>
      <section className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:mt-6 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <article key={index} className="flex min-h-24 flex-col items-center justify-center bg-card/45 p-2.5 text-center last:col-span-2 sm:min-h-32 sm:p-4 xl:last:col-span-1"><Skeleton className="size-7 rounded-md sm:size-8" /><Skeleton className="mt-3 h-3 w-16 sm:h-4" /><Skeleton className="mt-2 h-6 w-10 sm:h-7" /></article>)}
      </section>
      <section className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/35 sm:mt-6 sm:p-4"><div className="px-4 py-4 sm:p-0"><Skeleton className="h-5 w-24" /></div><div className="grid gap-px border-t border-border/70 bg-border/70 sm:mt-4 sm:grid-cols-2 sm:overflow-hidden sm:rounded-lg sm:border-0 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="bg-card px-4 py-3.5 sm:py-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-32 max-w-full" /></div>)}</div></section>
    </SkeletonFrame>
  );
}

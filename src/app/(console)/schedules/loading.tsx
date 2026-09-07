import { Skeleton } from "@/components/ui/skeleton";

function ScheduleCardSkeleton() {
  return <div className="overflow-hidden rounded-2xl border border-border/75 bg-background/55">
    <div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><Skeleton className="h-4 w-36" /><Skeleton className="h-6 w-14 rounded-full" /></div>
    <div className="p-5">
      <div className="grid min-h-28 grid-cols-[1fr_72px_1fr] items-center gap-3">
        <div className="flex flex-col items-center"><Skeleton className="size-12 rounded-full" /><Skeleton className="mt-3 h-4 w-20" /></div>
        <div className="flex flex-col items-center"><Skeleton className="h-5 w-7" /><Skeleton className="mt-2 h-3 w-12" /></div>
        <div className="flex flex-col items-center"><Skeleton className="size-12 rounded-full" /><Skeleton className="mt-3 h-4 w-20" /></div>
      </div>
      <div className="mt-5 space-y-4 rounded-xl border border-border/60 p-4"><div className="flex gap-3"><Skeleton className="size-4 shrink-0" /><div className="flex-1"><Skeleton className="h-3.5 w-28" /><Skeleton className="mt-2 h-3 w-3/4" /></div></div><div className="flex gap-3"><Skeleton className="size-4 shrink-0" /><div className="flex-1"><Skeleton className="h-3.5 w-40" /><Skeleton className="mt-2 h-3 w-2/3" /></div></div></div>
      <Skeleton className="mt-5 h-12 w-full rounded-lg" />
    </div>
  </div>;
}

export default function SchedulesLoading() {
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="일정 관리 화면을 불러오는 중">
    <Skeleton className="h-9 w-32" />
    <Skeleton className="mt-3 h-5 w-full max-w-xl" />
    <div className="mt-6 grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div>
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80">
      <div className="border-b border-border/70 px-5 py-4"><Skeleton className="h-5 w-24" /><Skeleton className="mt-2 h-3 w-80 max-w-full" /></div>
      <div className="grid gap-3 border-b border-border/70 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_176px_208px_auto]"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-4 w-16 self-center justify-self-end" /></div>
      <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <ScheduleCardSkeleton key={index} />)}</div>
    </section>
  </div>;
}

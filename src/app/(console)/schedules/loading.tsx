import { Skeleton } from "@/components/ui/skeleton";

function ScheduleCardSkeleton() {
  return <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/75 bg-background/55 md:min-h-96">
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 md:px-5"><Skeleton className="h-4 w-36 max-w-[60%]" /><Skeleton className="h-6 w-14 rounded-full" /></div>
    <div className="flex flex-1 flex-col p-4 md:p-5">
      <div className="grid min-h-28 grid-cols-[1fr_72px_1fr] items-center gap-3">
        <div className="flex flex-col items-center"><Skeleton className="size-12 rounded-full" /><Skeleton className="mt-3 h-4 w-20" /></div>
        <div className="flex flex-col items-center"><Skeleton className="h-5 w-7" /><Skeleton className="mt-2 h-3 w-12" /></div>
        <div className="flex flex-col items-center"><Skeleton className="size-12 rounded-full" /><Skeleton className="mt-3 h-4 w-20" /></div>
      </div>
      <div className="mt-5 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4"><div className="flex items-center gap-2.5"><Skeleton className="size-4 shrink-0" /><Skeleton className="h-3.5 w-28" /></div><div className="flex items-start gap-2.5"><Skeleton className="size-4 shrink-0" /><Skeleton className="h-3 w-3/4" /></div></div>
      <div className="mt-5 grid grid-cols-2 gap-2"><Skeleton className="h-11 w-full rounded-lg" /><Skeleton className="h-11 w-full rounded-lg" /></div>
    </div>
  </div>;
}

function ScheduleMetricSkeleton() {
  return <div className="min-w-0 bg-card/45 p-2.5 text-center md:p-4">
    <Skeleton className="mx-auto mb-3 size-7 rounded-md md:mb-4 md:size-8" />
    <Skeleton className="mx-auto h-3 w-14 max-w-full md:h-4 md:w-20" />
    <Skeleton className="mx-auto mt-2 h-6 w-16 max-w-full md:h-7 md:w-24" />
  </div>;
}

export default function SchedulesLoading() {
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="일정 관리 화면을 불러오는 중">
    <Skeleton className="h-9 w-32" />
    <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70">
      <ScheduleMetricSkeleton />
      <ScheduleMetricSkeleton />
      <ScheduleMetricSkeleton />
    </div>
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80">
      <div className="border-b border-border/70 px-5 py-4"><Skeleton className="h-5 w-24" /></div>
      <div className="grid grid-cols-2 gap-3 border-b border-border/70 p-4 xl:grid-cols-[minmax(280px,1fr)_176px_208px]">
        <Skeleton className="col-span-2 h-12 rounded-xl xl:col-span-1" />
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <ScheduleCardSkeleton key={index} />)}</div>
    </section>
  </div>;
}

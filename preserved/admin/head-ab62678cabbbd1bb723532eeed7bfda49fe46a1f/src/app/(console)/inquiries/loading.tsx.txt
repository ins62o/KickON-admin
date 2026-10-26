import { Skeleton } from "@/components/ui/skeleton";

function StatusMetricSkeleton() {
  return (
    <div className="flex min-h-20 flex-col items-start justify-start gap-2 bg-card/45 p-3 md:min-h-18 md:flex-row md:items-center md:justify-between md:gap-4 md:p-4">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Skeleton className="size-8 shrink-0 rounded-md md:size-10 md:rounded-lg" />
        <Skeleton className="h-4 w-20 md:h-5" />
      </div>
      <Skeleton className="h-6 w-10 md:h-7" />
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="grid min-w-[760px] grid-cols-[176px_minmax(240px,1fr)_208px_208px] items-center border-b border-border/70 px-4 py-4 last:border-b-0">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-52 max-w-[80%]" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-28" />
    </div>
  );
}

export default function InquiriesLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7"
      aria-busy="true"
      aria-label="문의 신고 정보를 불러오는 중"
    >
      <header className="border-b border-border/70 pb-4">
        <Skeleton className="h-9 w-28" />
      </header>

      <div className="mt-6 space-y-5">
        <div className="grid h-14 grid-cols-2 gap-1.5 rounded-xl border border-border/80 bg-card/45 p-1.5 md:h-16">
          <Skeleton className="h-full w-full rounded-lg" />
          <Skeleton className="h-full w-full rounded-lg" />
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70">
          <StatusMetricSkeleton />
          <StatusMetricSkeleton />
        </div>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35">
          <div className="border-b border-border/70 px-5 py-4">
            <Skeleton className="h-5 w-20" />
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-border/70 p-4 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto]">
            <Skeleton className="col-span-2 h-11 w-full rounded-xl lg:col-span-1" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="col-span-2 h-11 w-full rounded-xl lg:col-span-1 lg:w-20" />
          </div>

          <div className="divide-y divide-border/70 md:hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-6 w-14 rounded-md" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="mt-3 h-4 w-4/5" />
                <div className="mt-3 border-t border-border/60 pt-3"><Skeleton className="h-3 w-20" /></div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <div className="grid min-w-[760px] grid-cols-[176px_minmax(240px,1fr)_208px_208px] items-center border-b border-border/70 px-4 py-3">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <TableRowSkeleton key={index} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

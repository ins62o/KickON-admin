import { Skeleton } from "@/components/ui/skeleton";

function StatusMetricSkeleton() {
  return (
    <div className="flex min-h-18 items-center justify-between gap-4 bg-card/45 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-7 w-10" />
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
        <div className="grid h-16 grid-cols-2 gap-1.5 rounded-xl border border-border/80 bg-card/45 p-1.5">
          <Skeleton className="h-full w-full rounded-lg" />
          <Skeleton className="h-full w-full rounded-lg" />
        </div>

        <div className="metric-grid grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70">
          <StatusMetricSkeleton />
          <StatusMetricSkeleton />
        </div>

        <section className="overflow-hidden rounded-xl border border-border/80 bg-card/35">
          <div className="border-b border-border/70 px-5 py-4">
            <Skeleton className="h-5 w-20" />
          </div>

          <div className="grid gap-3 border-b border-border/70 p-4 lg:grid-cols-[minmax(260px,1fr)_190px_190px_auto]">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl lg:w-20" />
          </div>

          <div className="overflow-x-auto">
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

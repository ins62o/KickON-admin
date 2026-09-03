import { Skeleton } from "@/components/ui/skeleton";

function PlayerMetricSkeleton() {
  return (
    <div className="bg-card/45 p-4">
      <div className="mb-4 flex min-h-8 items-start justify-between">
        <Skeleton className="size-8 rounded-md" />
      </div>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-7 w-16" />
    </div>
  );
}

function PlayerRowSkeleton({ secondary = true }: { secondary?: boolean }) {
  return (
    <div className="grid min-w-[980px] grid-cols-[34%_23%_12%_17%_14%] items-center border-b border-border/70 px-2 py-4 last:border-b-0">
      <div className="space-y-2 pl-3">
        <Skeleton className="h-5 w-28" />
        {secondary ? <Skeleton className="h-3.5 w-24" /> : null}
      </div>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mx-auto h-4 w-8" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-4 w-12" />
    </div>
  );
}

export default function SquadsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="선수 관리 정보를 불러오는 중">
      <header className="flex items-end justify-between gap-4 border-b border-border/70 pb-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-11 w-32 rounded-lg" />
      </header>

      <section className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:grid-cols-2">
        <PlayerMetricSkeleton />
        <PlayerMetricSkeleton />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-14" />
        </header>

        <div className="flex flex-col gap-2 border-b border-border/70 p-3 lg:flex-row lg:items-center">
          <Skeleton className="h-11 w-full rounded-xl lg:max-w-sm" />
          <div className="flex items-center gap-2 lg:ml-auto">
            <Skeleton className="h-11 w-44 rounded-xl" />
            <Skeleton className="h-11 w-44 rounded-xl" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[34%_23%_12%_17%_14%] items-center border-b border-border/70 px-2 py-3">
            <Skeleton className="ml-3 h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mx-auto h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-10" />
          </div>
          {Array.from({ length: 8 }).map((_, index) => <PlayerRowSkeleton key={index} secondary={index % 3 !== 0} />)}
        </div>

        <footer className="flex items-center justify-between border-t border-border/70 px-3 py-3">
          <Skeleton className="h-3.5 w-20" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </footer>
      </section>
    </div>
  );
}

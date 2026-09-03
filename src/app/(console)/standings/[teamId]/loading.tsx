import { Skeleton } from "@/components/ui/skeleton";

function MetricSkeleton() {
  return (
    <article className="rounded-xl border border-border/80 bg-card/40 p-4">
      <Skeleton className="h-3.5 w-16" />
      <Skeleton className="mt-3 h-7 w-14" />
    </article>
  );
}

function PlayerRowSkeleton({ secondary = true }: { secondary?: boolean }) {
  return (
    <div className="grid min-w-[960px] grid-cols-[34%_10%_16%_10%_10%_10%_10%] items-center border-b border-border/70 py-4 last:border-b-0">
      <div className="space-y-2 pl-5">
        <Skeleton className="h-5 w-28" />
        {secondary ? <Skeleton className="h-3.5 w-24" /> : null}
      </div>
      <Skeleton className="mx-auto h-4 w-7" />
      <Skeleton className="h-4 w-14" />
      {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="ml-auto h-4 w-7" />)}
      <Skeleton className="ml-auto mr-5 h-4 w-7" />
    </div>
  );
}

export default function StandingDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="팀 상세 정보를 불러오는 중">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Skeleton className="size-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-6 w-16 rounded-md" />
          </div>
          <Skeleton className="h-3.5 w-44" />
        </div>
        <Skeleton className="h-10 w-24 rounded-lg" />
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <MetricSkeleton key={index} />)}
      </section>

      <section className="mt-6 rounded-xl border border-border/80 bg-card/40 p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="rounded-lg border border-border bg-background/35 p-4"><Skeleton className="h-3.5 w-16" /><Skeleton className="mt-2 h-5 w-12" /></div>)}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <header className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-5 w-24" />
          <div className="flex items-center gap-3"><Skeleton className="h-10 w-44 rounded-xl" /><Skeleton className="h-4 w-10" /></div>
        </header>
        <div className="overflow-x-auto">
          <div className="grid min-w-[960px] grid-cols-[34%_10%_16%_10%_10%_10%_10%] items-center border-b border-border/70 py-3.5">
            <Skeleton className="ml-5 h-4 w-10" />
            <Skeleton className="mx-auto h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="ml-auto h-4 w-10" />)}
          </div>
          {Array.from({ length: 8 }).map((_, index) => <PlayerRowSkeleton key={index} secondary={index % 3 !== 0} />)}
        </div>
      </section>
    </div>
  );
}

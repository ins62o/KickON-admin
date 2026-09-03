import { Skeleton } from "@/components/ui/skeleton";

function StandingRowSkeleton() {
  return (
    <div className="grid min-w-[1040px] grid-cols-[7%_29%_8%_8%_8%_8%_8%_8%_9%_7%] items-center border-b border-border/70 px-2 py-5 last:border-b-0">
      <Skeleton className="mx-auto h-5 w-5" />
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-10 rounded-lg" />
        <Skeleton className="h-5 w-24" />
      </div>
      {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="ml-auto h-4 w-7" />)}
      <Skeleton className="ml-auto mr-3 h-5 w-8" />
    </div>
  );
}

export default function StandingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7" aria-busy="true" aria-label="팀 관리 정보를 불러오는 중">
      <header className="border-b border-border/70 pb-4">
        <Skeleton className="h-9 w-28" />
      </header>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="border-b border-border/70 px-11 py-4">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[1040px] grid-cols-[7%_29%_8%_8%_8%_8%_8%_8%_9%_7%] items-center border-b border-border/70 px-2 py-3.5">
            <Skeleton className="mx-auto h-4 w-8" />
            <Skeleton className="h-4 w-10" />
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="ml-auto h-4 w-7" />)}
          </div>
          {Array.from({ length: 12 }).map((_, index) => <StandingRowSkeleton key={index} />)}
        </div>
      </section>
    </div>
  );
}

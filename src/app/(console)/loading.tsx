import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7"
      aria-busy="true"
      aria-label="대시보드를 불러오는 중"
    >
      <header className="border-b border-border/70 pb-4">
        <Skeleton className="h-9 w-32" />
      </header>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70">
        <div className="grid gap-px md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="flex min-h-72 flex-col bg-card px-4 py-5 sm:px-5">
              <header className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-8 rounded-md" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-6 w-14 rounded-md" />
              </header>
              <div className="flex flex-1 items-center justify-center py-4">
                <Skeleton className="size-44 rounded-full" />
              </div>
              <div className="border-t border-border/70 pt-3">
                <Skeleton className="mx-auto h-3 w-28" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-7 w-14 rounded-md" />
        </header>
        <div className="overflow-x-auto p-4 sm:p-5">
          <div className="grid min-w-[1260px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex h-36 flex-col bg-card px-4 py-4">
                <Skeleton className="size-9 rounded-lg" />
                <Skeleton className="mt-3 h-4 w-24" />
                <div className="mt-auto border-t border-border/60 pt-3">
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-5 w-20" />
        </header>
        <div className="p-4 sm:p-5">
          <div className="grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="flex min-h-28 items-center justify-between bg-card px-4 py-5 sm:px-5">
                <div className="flex items-center gap-3.5">
                  <Skeleton className="size-10 rounded-lg" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

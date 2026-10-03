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
        <div className="grid grid-cols-2 gap-px md:hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="flex min-h-44 flex-col bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
              <Skeleton className="mt-3 h-3 w-24 max-w-full" />
              <Skeleton className="mt-2 mb-2 h-6 w-20 max-w-full" />
              <div className="mt-auto border-t border-border/70 pt-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
            </article>
          ))}
        </div>

        <div className="hidden gap-px md:grid md:grid-cols-2 xl:grid-cols-4">
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
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70">
        <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className="flex min-h-44 min-w-0 flex-col bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
              <Skeleton className="mt-3 h-3 w-24 max-w-full" />
              <Skeleton className="mt-2 mb-2 h-6 w-20 max-w-full" />
              <div className="mt-auto border-t border-border/70 pt-3">
                <Skeleton className="h-3 w-32 max-w-full" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <header className="flex items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-5 w-40" />
        </header>
        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex min-h-28 flex-col gap-3 rounded-xl border border-border/80 bg-card p-3.5">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-4 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

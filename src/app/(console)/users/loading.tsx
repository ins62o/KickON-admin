import { Skeleton } from "@/components/ui/skeleton";

function TeamRowSkeleton() {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg border border-border/65 bg-background/35 p-3.5">
      <Skeleton className="size-10 rounded-lg" />
      <Skeleton className="h-4 w-24 max-w-full" />
      <Skeleton className="h-5 w-8" />
    </div>
  );
}

function UserRowSkeleton() {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 p-4 sm:grid-cols-[40px_minmax(120px,1fr)_minmax(120px,0.8fr)_auto] sm:p-5">
      <Skeleton className="size-10 rounded-lg" />
      <div className="min-w-0 space-y-1.5">
        <Skeleton className="h-5 w-24 max-w-full" />
        <Skeleton className="h-3 w-20 sm:hidden" />
      </div>
      <Skeleton className="hidden h-4 w-28 sm:block" />
      <Skeleton className="size-7 rounded-full" />
    </div>
  );
}

export default function UsersLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7"
      aria-busy="true"
      aria-label="사용자 정보를 불러오는 중"
    >
      <header className="border-b border-border/70 pb-4">
        <Skeleton className="h-9 w-24" />
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/35">
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-6 w-14 rounded-md" />
          </header>

          <div className="grid flex-1 content-start gap-2 p-4 sm:p-5">
            {Array.from({ length: 12 }).map((_, index) => (
              <TeamRowSkeleton key={index} />
            ))}
          </div>
        </section>

        <section className="flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card/35">
          <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <Skeleton className="h-5 w-24" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-7" />
            </div>
          </header>

          <div className="grid gap-3 border-b border-border/70 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-[minmax(190px,1fr)_minmax(160px,0.65fr)_minmax(160px,0.65fr)_auto] xl:items-end">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className={index === 0 ? "sm:col-span-2 xl:col-span-1" : undefined}>
                <Skeleton className="mb-2.5 h-4 w-16" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
            <div className="flex items-center sm:col-span-2 xl:col-span-1">
              <Skeleton className="h-11 w-full rounded-xl xl:w-20" />
            </div>
          </div>

          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <Skeleton className="h-5 w-24" />
          </div>

          <div className="hidden grid-cols-[40px_minmax(120px,1fr)_minmax(120px,0.8fr)_auto] items-center gap-3.5 border-b border-border/70 bg-muted/15 px-5 py-3 sm:grid">
            <Skeleton className="col-span-2 h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
          </div>

          <div className="flex-1 divide-y divide-border/70">
            {Array.from({ length: 8 }).map((_, index) => (
              <UserRowSkeleton key={index} />
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border/70 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-7 w-16 rounded-lg" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

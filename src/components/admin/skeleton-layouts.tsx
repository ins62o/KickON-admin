import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SkeletonFrame({
  children,
  label,
  maxWidth = "max-w-[1720px]",
}: {
  children: React.ReactNode;
  label: string;
  maxWidth?: string;
}) {
  return (
    <div
      className={cn("mx-auto w-full px-4 py-6 lg:px-6 lg:py-7", maxWidth)}
      aria-busy="true"
      aria-label={label}
      role="status"
    >
      {children}
    </div>
  );
}

export function PageTitleSkeleton({
  description = false,
  action = false,
  context = false,
  titleWidth = "w-32",
}: {
  description?: boolean;
  action?: boolean;
  context?: boolean;
  titleWidth?: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {context ? <Skeleton className="mb-3 h-4 w-24" /> : null}
        <Skeleton className={cn("h-9", titleWidth)} />
        {description ? <Skeleton className="mt-2 h-4 w-72 max-w-full" /> : null}
      </div>
      {action ? <Skeleton className="h-10 w-28 rounded-lg" /> : null}
    </header>
  );
}

export function DataManagementNavSkeleton() {
  return (
    <div>
      <PageTitleSkeleton titleWidth="w-28" />
      <div className="mt-5 flex h-11 items-center gap-2 border-b border-border/70">
        <div className="flex h-full items-center gap-2 border-b-2 border-primary px-4 sm:px-5">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex h-full items-center gap-2 px-4 sm:px-5">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export function MetricCardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="min-h-28 bg-card/45 p-4">
          <div className="flex items-start justify-between gap-3">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-md" />
          </div>
          <Skeleton className="mt-4 h-4 w-24" />
          <Skeleton className="mt-2 h-7 w-20" />
        </article>
      ))}
    </div>
  );
}

export function GaugeCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 md:grid-cols-2", count === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="flex min-h-64 flex-col bg-card px-4 py-5 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5"><Skeleton className="size-8 rounded-md" /><Skeleton className="h-4 w-28" /></div>
            <Skeleton className="h-6 w-14 rounded-md" />
          </div>
          <div className="flex flex-1 items-center justify-center py-4"><Skeleton className="size-36 rounded-full" /></div>
          <Skeleton className="mx-auto h-3 w-28" />
        </article>
      ))}
    </div>
  );
}

export function PanelSkeleton({
  children,
  titleWidth = "w-28",
  description = false,
  action = false,
  className,
}: {
  children?: React.ReactNode;
  titleWidth?: string;
  description?: boolean;
  action?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border/80 bg-card/35", className)}>
      <header className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
        <div><Skeleton className={cn("h-5", titleWidth)} />{description ? <Skeleton className="mt-2 h-3 w-64 max-w-full" /> : null}</div>
        {action ? <Skeleton className="h-8 w-20 rounded-lg" /> : null}
      </header>
      {children}
    </section>
  );
}

export function FilterSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 border-b border-border/70 p-4 md:grid-cols-2 xl:flex xl:items-end">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="min-w-0 flex-1"><Skeleton className="mb-2 h-3 w-14" /><Skeleton className="h-11 w-full rounded-xl" /></div>
      ))}
      <Skeleton className="h-11 w-full rounded-xl md:col-span-2 xl:w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 7, columns = 4, minWidth = "min-w-[760px]" }: { rows?: number; columns?: number; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <div className={cn("divide-y divide-border/70", minWidth)}>
        <div className="flex h-11 items-center gap-8 bg-muted/15 px-5">
          {Array.from({ length: columns }).map((_, index) => <Skeleton key={index} className="h-3 flex-1" />)}
        </div>
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex min-h-14 items-center gap-8 px-5 py-3.5">
            {Array.from({ length: columns }).map((_, column) => (
              <Skeleton key={column} className={cn("h-4 flex-1", column === 0 && "max-w-36", column === columns - 1 && "max-w-24")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailHeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div>
      <Skeleton className="mb-4 h-4 w-28" />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Skeleton className="h-8 w-52 max-w-full" /><Skeleton className="h-6 w-16 rounded-md" /></div>
          <Skeleton className="mt-2 h-4 w-80 max-w-full" />
          <div className="mt-3 flex gap-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-24" /></div>
        </div>
        {action ? <Skeleton className="h-9 w-28 rounded-lg" /> : null}
      </header>
    </div>
  );
}

export function TextPanelSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="p-5">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn("h-4", index === lines - 1 ? "w-2/3" : "w-full", index > 0 && "mt-3")} />
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className={index === fields - 1 ? "sm:col-span-2" : undefined}>
          <Skeleton className="mb-2 h-3 w-20" />
          <Skeleton className={cn("w-full rounded-lg", index === fields - 1 ? "h-24" : "h-10")} />
        </div>
      ))}
      <Skeleton className="h-10 w-24 rounded-lg sm:col-start-2 sm:justify-self-end" />
    </div>
  );
}

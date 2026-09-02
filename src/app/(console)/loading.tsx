import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-7 lg:px-6">
      <Skeleton className="h-9 w-44" />
      <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-none bg-card" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 rounded-xl bg-card" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityNoticesLoading() {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <div className="flex items-end justify-between gap-4 border-b border-border/70 pb-4">
        <div><Skeleton className="h-8 w-28" /><Skeleton className="mt-3 h-4 w-96 max-w-[70vw]" /></div>
        <Skeleton className="h-10 w-32" />
      </div>
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80">
        <Skeleton className="h-14 w-full rounded-none" />
        {[0, 1, 2, 3].map((row) => <div key={row} className="grid grid-cols-6 gap-4 border-t border-border/70 px-4 py-5"><Skeleton className="col-span-2 h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /></div>)}
      </section>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function LoginLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background" aria-busy="true" aria-label="로그인 화면을 준비하는 중" role="status">
      <main className="grid flex-1 place-items-center px-4 py-10">
        <section className="w-full max-w-[410px] rounded-xl border border-border bg-card p-7 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex items-center gap-3.5"><Skeleton className="size-12 rounded-xl" /><Skeleton className="h-6 w-36" /></div>
          <div className="mt-7 rounded-lg border border-border/80 bg-muted/30 p-1.5">
            <div className="px-2 py-1"><Skeleton className="h-3.5 w-48 max-w-full" /></div>
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <Skeleton className="h-8 rounded-md" />
              <Skeleton className="h-8 rounded-md" />
            </div>
          </div>
          <div className="mt-9 space-y-6">
            <div><Skeleton className="mb-2.5 h-4 w-24" /><Skeleton className="h-12 w-full rounded-lg" /></div>
            <div><Skeleton className="mb-2.5 h-4 w-16" /><Skeleton className="h-12 w-full rounded-lg" /></div>
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </section>
      </main>
      <footer className="border-t border-border/70 px-4 py-5">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-20" /></div>
          <Skeleton className="h-3 w-52" />
        </div>
      </footer>
    </div>
  );
}

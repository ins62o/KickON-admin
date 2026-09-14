import { PanelSkeleton, SkeletonFrame, TextPanelSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function InquiryDetailLoading() {
  return (
    <SkeletonFrame label="문의 상세 정보를 불러오는 중" maxWidth="max-w-[1720px]">
      <header className="flex items-start justify-between gap-3 border-b border-border/70 pb-4"><Skeleton className="h-8 w-64 max-w-[75%]" /><Skeleton className="h-6 w-16 shrink-0 rounded-md" /></header>
      <PanelSkeleton className="mt-5 sm:mt-6" titleWidth="w-20">
        <TextPanelSkeleton lines={4} />
        <div className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70 sm:gap-5 sm:bg-transparent sm:p-5 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="bg-card px-4 py-3.5 sm:bg-transparent sm:p-0"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-full" /></div>)}</div>
      </PanelSkeleton>
      <PanelSkeleton className="mt-5 sm:mt-6" titleWidth="w-20"><div className="p-4 sm:p-5"><Skeleton className="h-48 w-full rounded-xl sm:h-24 sm:rounded-lg" /><Skeleton className="mt-4 h-11 w-full rounded-lg sm:ml-auto sm:w-24" /></div></PanelSkeleton>
    </SkeletonFrame>
  );
}

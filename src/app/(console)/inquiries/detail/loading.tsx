import { DetailHeaderSkeleton, FormSkeleton, PanelSkeleton, SkeletonFrame, TextPanelSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function InquiryDetailLoading() {
  return (
    <SkeletonFrame label="문의 상세 정보를 불러오는 중" maxWidth="max-w-[1720px]">
      <DetailHeaderSkeleton action={false} />
      <PanelSkeleton className="mt-6" titleWidth="w-20">
        <TextPanelSkeleton lines={4} />
        <div className="grid gap-5 border-t border-border/70 p-5 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index}><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-full" /></div>)}</div>
      </PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-20"><FormSkeleton fields={1} /></PanelSkeleton>
    </SkeletonFrame>
  );
}

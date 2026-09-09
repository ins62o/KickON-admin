import { DetailHeaderSkeleton, FormSkeleton, MetricCardsSkeleton, PanelSkeleton, SkeletonFrame } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserDetailLoading() {
  return (
    <SkeletonFrame label="사용자 상세 정보를 불러오는 중" maxWidth="max-w-[1720px]">
      <DetailHeaderSkeleton context={false} description={false} metadata={false} identityIcon status={false} />
      <section className="mt-6"><MetricCardsSkeleton count={5} /></section>
      <PanelSkeleton className="mt-6" titleWidth="w-24"><div className="grid gap-px bg-border/70 sm:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="bg-card px-4 py-4"><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-32" /></div>)}</div></PanelSkeleton>
      <PanelSkeleton className="mt-6" titleWidth="w-24"><FormSkeleton fields={3} /></PanelSkeleton>
    </SkeletonFrame>
  );
}

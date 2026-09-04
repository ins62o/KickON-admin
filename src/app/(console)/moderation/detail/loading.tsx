import { DetailHeaderSkeleton, FormSkeleton, PanelSkeleton, SkeletonFrame, TextPanelSkeleton } from "@/components/admin/skeleton-layouts";
import { Skeleton } from "@/components/ui/skeleton";

export default function ModerationDetailLoading() {
  return (
    <SkeletonFrame label="신고 상세 정보를 불러오는 중" maxWidth="max-w-[1200px]">
      <DetailHeaderSkeleton action={false} />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <PanelSkeleton titleWidth="w-28" action><TextPanelSkeleton lines={6} /></PanelSkeleton>
        <aside className="space-y-5">{Array.from({ length: 2 }).map((_, panel) => <PanelSkeleton key={panel} titleWidth={panel === 0 ? "w-20" : "w-16"}><div className="space-y-4 p-4">{Array.from({ length: panel === 0 ? 4 : 3 }).map((__, index) => <div key={index}><Skeleton className="h-3 w-16" /><Skeleton className="mt-2 h-4 w-full" /></div>)}</div></PanelSkeleton>)}</aside>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2"><PanelSkeleton titleWidth="w-24" description><FormSkeleton fields={3} /></PanelSkeleton><PanelSkeleton titleWidth="w-28" description><FormSkeleton fields={3} /></PanelSkeleton></div>
    </SkeletonFrame>
  );
}

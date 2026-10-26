"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Eye, Heart, MessageCircle } from "lucide-react";

import { ActivityHistory } from "@/components/admin/activity-history";
import { ActivityTeamFilter } from "@/components/admin/activity-team-filter";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { CommunityBoardBadge } from "@/components/admin/community-board-badge";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { UserNickname } from "@/components/admin/user-nickname";
import { getCommunityPosts } from "@/lib/admin/activity-client";
import { getActivityPageNumber } from "@/lib/admin/activity-records";
import { communityCategoryLabel, statusTone } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { SUPPORTED_TEAM_IDS } from "@/lib/data/catalog";
import { formatKoreaDateTime, formatKoreaFullDateTime, formatNumber } from "@/lib/format";

export default function CommunityPostsPage() {
  const admin = useRequiredAdminPermission("moderation.read");
  const params = useSearchParams();
  const page = getActivityPageNumber(params.get("page"));
  const query = (params.get("q") ?? "").slice(0, 200);
  const teamId = SUPPORTED_TEAM_IDS.find((id) => id === params.get("team")) ?? "";
  const { data, error, loading, reload } = useClientData(() => admin ? getCommunityPosts(page, query, undefined, teamId) : Promise.resolve(null), [admin?.userId, page, query, teamId]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "커뮤니티 글을 불러오지 못했습니다."} retry={reload} />;
  return <ActivityHistory title="커뮤니티 글" base="/community/posts" total={data.total} page={page} query={query} placeholder="제목, 본문, 작성자 검색" showDashboardLink={false} teamId={teamId} filters={<ActivityTeamFilter teamId={teamId} label="커뮤니티 팀 선택" />}>
    <div className="divide-y divide-border/70">
      {data.records.map((post) => {
        const search = new URLSearchParams({ postId: post.id, page: String(page), q: query });
        if (teamId) search.set("team", teamId);
        return <Link key={post.id} href={`/community/posts/detail?${search}`} className="group block min-w-0 px-4 py-4 transition-colors hover:bg-primary/[0.055] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            <h2 className="min-w-0 flex-1 line-clamp-2 text-base leading-6 font-semibold text-foreground [overflow-wrap:anywhere] group-hover:text-primary">{post.title}</h2>
            {post.moderation_status === "HIDDEN" ? <AdminStatusBadge label="숨김" tone={statusTone(post.moderation_status)} /> : null}
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/60 group-hover:text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            <UserNickname nickname={post.author_name ?? "작성자 확인 불가"} teamId={post.author_team_id} />
            <time dateTime={post.created_at} title={formatKoreaFullDateTime(post.created_at)} className="whitespace-nowrap text-[11px]">{formatKoreaDateTime(post.created_at)}</time>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <CommunityBoardBadge board={post.board} teamId={post.team_id} teamName={post.team_name} className="px-2 py-0.5 text-[11px] font-medium" />
              <span className="shrink-0 text-[11px] text-muted-foreground">{communityCategoryLabel(post.category)}</span>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
              <span className="inline-flex items-center gap-1" title="조회"><Eye className="size-3.5" aria-hidden="true" /><span className="sr-only">조회 </span>{formatNumber(post.view_count)}</span>
              <span className="inline-flex items-center gap-1" title="좋아요"><Heart className="size-3.5" aria-hidden="true" /><span className="sr-only">좋아요 </span>{formatNumber(post.like_count)}</span>
              <span className="inline-flex items-center gap-1" title="댓글"><MessageCircle className="size-3.5" aria-hidden="true" /><span className="sr-only">댓글 </span>{formatNumber(post.comment_count)}</span>
            </div>
          </div>
        </Link>;
      })}
      {data.records.length === 0 && data.total > 0 ? <p className="p-8 text-center text-sm text-muted-foreground">이 페이지에 내역이 없습니다. 이전 페이지에서 확인해 주세요.</p> : null}
    </div>
  </ActivityHistory>;
}

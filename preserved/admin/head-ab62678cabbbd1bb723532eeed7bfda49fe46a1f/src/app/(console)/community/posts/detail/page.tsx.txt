"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";

import { ActivityDetailField, activityListHref } from "@/components/admin/activity-history";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { CommunityBoardBadge } from "@/components/admin/community-board-badge";
import { PageHeader } from "@/components/admin/page-header";
import { AdminStatusBadge } from "@/components/admin/status-badge";
import { UserNickname } from "@/components/admin/user-nickname";
import { getCommunityPost } from "@/lib/admin/activity-client";
import { getActivityPageNumber } from "@/lib/admin/activity-records";
import { communityCategoryLabel, statusTone } from "@/lib/admin/labels";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { formatKoreaDateTime, formatNumber } from "@/lib/format";

export default function CommunityPostDetailPage() {
  const admin = useRequiredAdminPermission("moderation.read");
  const params = useSearchParams();
  const id = params.get("postId") ?? "";
  const backHref = activityListHref("/community/posts", getActivityPageNumber(params.get("page")), params.get("q") ?? "", params.get("team") ?? "");
  const { data: post, error, loading, reload } = useClientData(() => admin ? getCommunityPost(id) : Promise.resolve(null), [admin?.userId, id]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error) return <ClientPageError message={error} retry={reload} />;
  if (!post) return <div className="p-8 text-center"><p>글을 찾을 수 없습니다. 삭제된 글일 수 있습니다.</p><Link href={backHref} className="mt-4 inline-block text-primary hover:underline">커뮤니티 글 목록으로</Link></div>;
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title={post.title} status={post.moderation_status === "HIDDEN" ? <AdminStatusBadge label="숨김" tone={statusTone(post.moderation_status)} /> : undefined} metadata={<><span>조회 {formatNumber(post.view_count)}</span><span>좋아요 {formatNumber(post.like_count)}</span><span>댓글 {formatNumber(post.comment_count)}</span></>} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-border/70" aria-label="게시글 정보">
      <dl className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
        <ActivityDetailField label="작성자"><Link href={`/users/detail?userId=${encodeURIComponent(post.author_id)}`} className="text-primary hover:underline"><UserNickname nickname={post.author_name ?? "작성자 확인 불가"} teamId={post.author_team_id} /></Link></ActivityDetailField>
        <ActivityDetailField label="작성자 ID">{post.author_id}</ActivityDetailField>
        <ActivityDetailField label="게시판"><CommunityBoardBadge board={post.board} teamId={post.team_id} teamName={post.team_name} /></ActivityDetailField>
        <ActivityDetailField label="분류">{communityCategoryLabel(post.category)}</ActivityDetailField>
        <ActivityDetailField label="작성 시각">{formatKoreaDateTime(post.created_at)}</ActivityDetailField>
        <ActivityDetailField label="수정 시각">{formatKoreaDateTime(post.updated_at)}</ActivityDetailField>
        <ActivityDetailField label="게시글 ID">{post.id}</ActivityDetailField>
        <ActivityDetailField label="노출 상태 변경 시각">{post.moderated_at ? formatKoreaDateTime(post.moderated_at) : "변경 기록 없음"}</ActivityDetailField>
        {post.emoticon_key ? <ActivityDetailField label="이모티콘">{post.emoticon_key}</ActivityDetailField> : null}
      </dl>
    </section>
    <section className="mt-6 rounded-xl border border-border/80 bg-card/35 p-5" aria-labelledby="post-content-title">
      <h2 id="post-content-title" className="text-base font-semibold">본문</h2>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{post.content}</p>
      {post.image_urls.length > 0 ? <div className="mt-5 grid gap-4 sm:grid-cols-2">{post.image_urls.map((url, index) => (
        /^https?:\/\//i.test(url) ? <a key={`${url}-${index}`} href={url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-border/70"><Image src={url} alt={`게시글 첨부 이미지 ${index + 1}`} width={1200} height={900} unoptimized className="h-auto max-h-[600px] w-full object-contain" /></a> : null
      ))}</div> : null}
    </section>
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="post-comments-title">
      <h2 id="post-comments-title" className="border-b border-border/70 px-5 py-4 text-base font-semibold">댓글 {formatNumber(post.comment_count)}개</h2>
      <div className="divide-y divide-border/70">{post.comments.map((comment) => <article key={comment.id} id={`comment-${comment.id}`} className={`p-5 ${comment.parent_comment_id ? "ml-5 border-l-2 border-primary/20" : ""}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs"><Link href={`/users/detail?userId=${encodeURIComponent(comment.user_id)}`} className="font-semibold text-primary hover:underline"><UserNickname nickname={comment.author_name ?? "작성자 확인 불가"} teamId={comment.author_team_id} /></Link><span className="text-muted-foreground">{formatKoreaDateTime(comment.created_at)}</span>{comment.moderation_status === "HIDDEN" ? <AdminStatusBadge label="숨김" tone={statusTone(comment.moderation_status)} /> : null}{comment.parent_comment_id ? <a href={`#comment-${comment.parent_comment_id}`} className="text-primary hover:underline">답글 · 원댓글 보기</a> : null}</div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{comment.content || (comment.emoticon_key ? `이모티콘: ${comment.emoticon_key}` : "내용 없음")}</p>
      </article>)}{post.comments.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">댓글이 없습니다.</p> : null}</div>
    </section>
  </div>;
}

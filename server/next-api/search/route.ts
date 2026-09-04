import type { SupabaseClient } from "@supabase/supabase-js";
// Legacy Next.js Route Handler retained for migration to the CloudFront API origin.
import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/auth/permissions";
import { getCurrentAdmin } from "@/lib/auth/server";
import { getOperationsClient } from "@/lib/data/operations-client";
import type { GlobalSearchItem, GlobalSearchResponse } from "@/lib/search/types";

export const dynamic = "force-dynamic";

const PER_TYPE_LIMIT = 6;
const TOTAL_RESULT_LIMIT = 24;
const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
};

type QueryError = { message: string };
type SearchBucket = { items: GlobalSearchItem[]; failed: boolean };
type TeamRow = { id: string; name: string; short_name: string; code: string };
type ProfileRow = { id: string; nickname: string; team_id: string | null };
type InquiryRow = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
};
type ReportRow = {
  id: string;
  target_type: string;
  post_id: string | null;
  comment_id: string | null;
  cheer_message_id: string | null;
  status: string;
};
type PostTargetRow = { id: string; title: string };
type CommentTargetRow = { id: string };
type CheerTargetRow = { id: string };
type PlayerRow = {
  player_id: string;
  player_name: string;
  display_name: string | null;
  display_name_ko: string | null;
  team_id: string;
  shirt_number: number | null;
  position: string | null;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: GlobalSearchResponse | { error: string }, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}

function searchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function uniqueRows<T>(rows: T[], key: (row: T) => string) {
  return [...new Map(rows.map((row) => [key(row), row])).values()];
}

function hasQueryError(results: Array<{ error: QueryError | null }>) {
  return results.some((result) => Boolean(result.error));
}

function compactText(value: string | null | undefined, maxLength = 120) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

async function searchUsers(
  client: SupabaseClient,
  query: string,
  pattern: string,
  teams: TeamRow[],
  matchingTeamIds: string[],
): Promise<SearchBucket> {
  const requests = [
    client.from("profiles").select("id,nickname,team_id").ilike("nickname", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
  ];
  if (uuidPattern.test(query)) {
    requests.push(client.from("profiles").select("id,nickname,team_id").eq("id", query).limit(1));
  }
  if (matchingTeamIds.length > 0) {
    requests.push(client.from("profiles").select("id,nickname,team_id").in("team_id", matchingTeamIds).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT));
  }

  const results = await Promise.all(requests);
  const rows = uniqueRows(
    results.flatMap((result) => (result.data ?? []) as ProfileRow[]),
    (row) => row.id,
  ).slice(0, PER_TYPE_LIMIT);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return {
    items: rows.map((row) => {
      const teamName = row.team_id ? teamNames.get(row.team_id) ?? row.team_id : "응원 팀 미선택";
      return {
        id: `user-${row.id}`,
        type: "user",
        label: row.nickname.trim() || "닉네임 미설정",
        description: `${teamName} · ${row.id.slice(0, 8)}`,
        keywords: `${row.nickname} ${row.id} ${teamName}`,
        href: `/users/detail/?userId=${encodeURIComponent(row.id)}`,
      } satisfies GlobalSearchItem;
    }),
    failed: hasQueryError(results),
  };
}

async function searchInquiries(
  client: SupabaseClient,
  query: string,
  pattern: string,
  teams: TeamRow[],
): Promise<SearchBucket> {
  const select = "id,user_id,category,subject,status";
  const requests = [
    client.from("support_inquiries").select(select).ilike("subject", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("support_inquiries").select(select).ilike("content", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("support_inquiries").select(select).ilike("category", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("support_inquiries").select(select).ilike("status", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
  ];
  if (uuidPattern.test(query)) {
    requests.push(client.from("support_inquiries").select(select).eq("id", query).limit(1));
  }

  const results = await Promise.all(requests);
  const rows = uniqueRows(
    results.flatMap((result) => (result.data ?? []) as InquiryRow[]),
    (row) => row.id,
  ).slice(0, PER_TYPE_LIMIT);
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const profilesResult = userIds.length > 0
    ? await client.from("profiles").select("id,nickname,team_id").in("id", userIds)
    : { data: [] as ProfileRow[], error: null };
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return {
    items: rows.map((row) => {
      const profile = profiles.get(row.user_id);
      const teamName = profile?.team_id ? teamNames.get(profile.team_id) ?? profile.team_id : null;
      const requester = profile?.nickname || row.user_id.slice(0, 8);
      return {
        id: `inquiry-${row.id}`,
        type: "inquiry",
        label: compactText(row.subject) || "제목 없는 문의",
        description: `${requester}${teamName ? ` · ${teamName}` : ""} · ${row.category} · ${row.status}`,
        keywords: `${row.id} ${row.subject} ${row.category} ${row.status} ${requester} ${teamName ?? ""}`,
        href: `/inquiries/detail/?inquiryId=${encodeURIComponent(row.id)}`,
      } satisfies GlobalSearchItem;
    }),
    failed: hasQueryError(results) || Boolean(profilesResult.error),
  };
}

function reportTargetId(report: ReportRow) {
  if (report.target_type === "POST") return report.post_id;
  if (report.target_type === "COMMENT") return report.comment_id;
  if (report.target_type === "FIXTURE_CHEER") return report.cheer_message_id;
  return report.post_id ?? report.comment_id ?? report.cheer_message_id;
}

async function searchModeration(
  client: SupabaseClient,
  query: string,
  pattern: string,
): Promise<SearchBucket> {
  const reportSelect = "id,target_type,post_id,comment_id,cheer_message_id,status";
  const reportRequests = [
    client.from("content_reports").select(reportSelect).ilike("reason", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("content_reports").select(reportSelect).ilike("details", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("content_reports").select(reportSelect).ilike("status", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
  ];
  if (uuidPattern.test(query)) {
    reportRequests.push(client.from("content_reports").select(reportSelect).eq("id", query).limit(1));
  }

  const [directReportResults, postTitleResult, postContentResult, commentResult, cheerResult] = await Promise.all([
    Promise.all(reportRequests),
    client.from("posts").select("id,title").ilike("title", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("posts").select("id,title").ilike("content", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("comments").select("id").ilike("content", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
    client.from("fixture_cheer_messages").select("id").ilike("content", pattern).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT),
  ]);

  const matchingPosts = uniqueRows(
    [...(postTitleResult.data ?? []), ...(postContentResult.data ?? [])] as PostTargetRow[],
    (row) => row.id,
  );
  const matchingComments = (commentResult.data ?? []) as CommentTargetRow[];
  const matchingCheers = (cheerResult.data ?? []) as CheerTargetRow[];
  const targetReportRequests = [];
  if (matchingPosts.length > 0) {
    targetReportRequests.push(client.from("content_reports").select(reportSelect).in("post_id", matchingPosts.map((row) => row.id)).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT));
  }
  if (matchingComments.length > 0) {
    targetReportRequests.push(client.from("content_reports").select(reportSelect).in("comment_id", matchingComments.map((row) => row.id)).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT));
  }
  if (matchingCheers.length > 0) {
    targetReportRequests.push(client.from("content_reports").select(reportSelect).in("cheer_message_id", matchingCheers.map((row) => row.id)).order("created_at", { ascending: false }).limit(PER_TYPE_LIMIT));
  }
  const targetReportResults = await Promise.all(targetReportRequests);
  const allReportResults = [...directReportResults, ...targetReportResults];
  const reports = uniqueRows(
    allReportResults.flatMap((result) => (result.data ?? []) as ReportRow[]),
    (row) => row.id,
  ).slice(0, PER_TYPE_LIMIT);

  const postIds = [...new Set(reports.map((row) => row.post_id).filter((id): id is string => Boolean(id)))];
  const reportPostsResult = postIds.length > 0
    ? await client.from("posts").select("id,title").in("id", postIds)
    : { data: [] as PostTargetRow[], error: null };

  const posts = new Map(uniqueRows(
    [...matchingPosts, ...((reportPostsResult.data ?? []) as PostTargetRow[])],
    (row) => row.id,
  ).map((row) => [row.id, row]));
  const targetLabels: Record<string, string> = {
    POST: "게시글",
    COMMENT: "댓글",
    FIXTURE_CHEER: "응원톡",
  };

  const items = reports.map((report) => {
    const id = reportTargetId(report);
    let postTitle: string | null = null;
    if (report.target_type === "POST" && id) {
      const post = posts.get(id);
      postTitle = post?.title || null;
    }
    const targetLabel = targetLabels[report.target_type] ?? report.target_type;
    return {
      id: `moderation-${report.id}`,
      type: "moderation",
      label: compactText(postTitle) || `${targetLabel} 신고 · ${(id ?? report.id).slice(0, 8)}`,
      description: `${targetLabel} · ${report.status} · 신고 ${report.id.slice(0, 8)}`,
      keywords: `${report.id} ${id ?? ""} ${postTitle ?? ""} ${report.target_type} ${report.status}`,
      href: `/moderation/detail/?reportId=${encodeURIComponent(report.id)}`,
    } satisfies GlobalSearchItem;
  });

  const targetSearchResults = [postTitleResult, postContentResult, commentResult, cheerResult];
  const targetLoadResults = [reportPostsResult];
  return {
    items,
    failed: hasQueryError(allReportResults) || hasQueryError(targetSearchResults) || hasQueryError(targetLoadResults),
  };
}

async function searchPlayers(
  client: SupabaseClient,
  pattern: string,
  teams: TeamRow[],
  matchingTeamIds: string[],
): Promise<SearchBucket> {
  const select = "player_id,player_name,display_name,display_name_ko,team_id,shirt_number,position";
  const base = () => client.from("team_players").select(select).eq("season", 2026).eq("in_squad", true);
  const requests = [
    base().ilike("player_name", pattern).order("player_name", { ascending: true }).limit(PER_TYPE_LIMIT),
    base().ilike("display_name", pattern).order("player_name", { ascending: true }).limit(PER_TYPE_LIMIT),
    base().ilike("display_name_ko", pattern).order("player_name", { ascending: true }).limit(PER_TYPE_LIMIT),
    base().ilike("position", pattern).order("player_name", { ascending: true }).limit(PER_TYPE_LIMIT),
  ];
  if (matchingTeamIds.length > 0) {
    requests.push(base().in("team_id", matchingTeamIds).order("player_name", { ascending: true }).limit(PER_TYPE_LIMIT));
  }

  const results = await Promise.all(requests);
  const rows = uniqueRows(
    results.flatMap((result) => (result.data ?? []) as PlayerRow[]),
    (row) => row.player_id,
  ).slice(0, PER_TYPE_LIMIT);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return {
    items: rows.map((row) => {
      const teamName = teamNames.get(row.team_id) ?? row.team_id;
      return {
        id: `player-${row.player_id}`,
        type: "player",
        label: row.display_name_ko || row.display_name || row.player_name,
        description: `${teamName}${row.shirt_number !== null ? ` · ${row.shirt_number}번` : ""} · ${row.position ?? "포지션 미확인"}`,
        keywords: `${row.player_id} ${row.player_name} ${row.display_name ?? ""} ${row.display_name_ko ?? ""} ${teamName} ${row.position ?? ""}`,
        href: `/squads/detail/?playerId=${encodeURIComponent(row.player_id)}`,
      } satisfies GlobalSearchItem;
    }),
    failed: hasQueryError(results),
  };
}

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return response({ error: "관리자 로그인이 필요합니다." }, 401);

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 80) {
    return response({ error: "검색어는 2자 이상 80자 이하로 입력해 주세요." }, 400);
  }

  const client = await getOperationsClient();
  if (!client) return response({ error: "검색 데이터 연결을 확인할 수 없습니다." }, 503);

  const canSearchUsers = hasAdminPermission(admin.role, "users.read");
  const canSearchInquiries = hasAdminPermission(admin.role, "support.read");
  const canSearchModeration = hasAdminPermission(admin.role, "moderation.read");
  const canSearchPlayers = hasAdminPermission(admin.role, "data.read");
  const needsTeams = canSearchUsers || canSearchInquiries || canSearchPlayers;
  const teamsResult = needsTeams
    ? await client.from("teams").select("id,name,short_name,code").order("name", { ascending: true }).limit(100)
    : { data: [] as TeamRow[], error: null };
  const teams = (teamsResult.data ?? []) as TeamRow[];
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const matchingTeamIds = teams
    .filter((team) => `${team.id} ${team.name} ${team.short_name} ${team.code}`.toLocaleLowerCase("ko-KR").includes(normalizedQuery))
    .map((team) => team.id);
  const pattern = searchPattern(query);
  const searches: Promise<SearchBucket>[] = [];

  if (canSearchUsers) searches.push(searchUsers(client, query, pattern, teams, matchingTeamIds));
  if (canSearchInquiries) searches.push(searchInquiries(client, query, pattern, teams));
  if (canSearchModeration) searches.push(searchModeration(client, query, pattern));
  if (canSearchPlayers) searches.push(searchPlayers(client, pattern, teams, matchingTeamIds));

  const buckets = await Promise.all(searches);
  const failed = Boolean(teamsResult.error) || buckets.some((bucket) => bucket.failed);
  return response({
    items: buckets.flatMap((bucket) => bucket.items).slice(0, TOTAL_RESULT_LIMIT),
    error: failed ? "일부 검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : null,
  });
}

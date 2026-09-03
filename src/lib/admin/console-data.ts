import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import {
  getOperationsClient,
  isOperationsSchemaMissing,
} from "@/lib/data/operations-client";
import { getSupabaseConnection } from "@/lib/data/supabase";

export type AdminDashboardRange = "today" | "7d" | "month";

export type AdminTeamDistributionRecord = {
  teamId: string | null;
  teamName: string;
  memberCount: number | null;
};

export type AdminFailedSyncRecord = {
  id: string;
  jobKey: string;
  status: string;
  failedCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type AdminSyncFreshnessRecord = {
  syncKey: string;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
};

export type AdminDashboardData = {
  range: AdminDashboardRange;
  generatedAt: string;
  totalProfiles: number | null;
  newToday: number | null;
  new7d: number | null;
  newMonth: number | null;
  selectedNewProfiles: number | null;
  teamDistribution: AdminTeamDistributionRecord[];
  posts: number | null;
  comments: number | null;
  attendances: number | null;
  openInquiries: number | null;
  openReports: number | null;
  failedSyncCount: number | null;
  recentFailedSyncs: AdminFailedSyncRecord[];
  syncFreshness: AdminSyncFreshnessRecord[];
  schemaReady: boolean;
  enhancementsReady: boolean;
  error: string | null;
  warnings: string[];
};

export type AdminDashboardSummaryData = {
  generatedAt: string;
  totalProfiles: number | null;
  profilesError: string | null;
  syncFailure24h: "detected" | "none" | "unavailable";
  failedSyncCount24h: number | null;
  syncError: string | null;
};

export type AdminDashboardAttentionItem = {
  count: number | null;
  error: string | null;
};

export type AdminDashboardAttentionData = {
  inquiries: AdminDashboardAttentionItem;
  reports: AdminDashboardAttentionItem;
};

export type AdminUserRecord = {
  id: string;
  nickname: string;
  teamId: string | null;
  teamName: string | null;
  authProvider: string | null;
  createdAt: string;
  updatedAt: string | null;
  postCount: number | null;
  commentCount: number | null;
  attendanceCount: number | null;
  reportCount: number | null;
  warningCount: number | null;
  recentActivityAt: string | null;
  accountStatus: string | null;
  suspendedUntil: string | null;
};

export type AdminUsersData = {
  users: AdminUserRecord[];
  schemaReady: boolean;
  enhancementsReady: boolean;
  error: string | null;
  warnings: string[];
};

export type AdminProfileSummary = {
  id: string;
  nickname: string;
  teamId: string | null;
  teamName: string | null;
};

export type AdminSupportInquiryRecord = {
  id: string;
  userId: string;
  requester: AdminProfileSummary | null;
  category: string;
  subject: string;
  content: string;
  status: string;
  adminNote: string | null;
  answer: string | null;
  answeredBy: string | null;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
};

export type AdminSupportInquiryData = {
  inquiries: AdminSupportInquiryRecord[];
  schemaReady: boolean;
  enhancementsReady: boolean;
  error: string | null;
  warnings: string[];
};

export type AdminSupportInquiryDetailData = {
  inquiry: AdminSupportInquiryRecord | null;
  adminNotes: Array<{ id: string; note: string; createdBy: string | null; createdAt: string }>;
  schemaReady: boolean;
  enhancementsReady: boolean;
  error: string | null;
};

export type AdminModerationTarget = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  emoticonKey: string | null;
  author: AdminProfileSummary | null;
  createdAt: string;
  moderationStatus: string | null;
};

export type AdminModerationRecord = {
  id: string;
  reporter: AdminProfileSummary | null;
  targetType: string;
  targetId: string | null;
  target: AdminModerationTarget | null;
  reason: string;
  details: string | null;
  status: string;
  cumulativeReportCount: number;
  createdAt: string;
  reviewedAt: string | null;
};

export type AdminModerationData = {
  reports: AdminModerationRecord[];
  schemaReady: boolean;
  enhancementsReady: boolean;
  error: string | null;
  warnings: string[];
};

type DatabaseError = {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
};

type QueryIssue = {
  source: string;
  error: DatabaseError;
};

type CollectionResult<T> = {
  rows: T[];
  error: DatabaseError | null;
};

type TeamRow = {
  id: string;
  name: string;
};

type BasicProfileRow = {
  id: string;
  nickname: string;
  team_id: string | null;
  created_at: string;
  updated_at: string;
};

type EnhancedProfileRow = BasicProfileRow & {
  account_status: string | null;
  suspended_until: string | null;
};

type AdminUsersRpcRow = {
  user_id: string;
  nickname: string;
  team_id: string | null;
  team_name: string | null;
  joined_at: string;
  post_count: number;
  comment_count: number;
  attendance_count: number;
  received_report_count: number;
  recent_activity_at: string | null;
  account_status: string;
  suspended_until: string | null;
  warning_count: number;
};

type AdminUserAuthProviderRpcRow = {
  user_id: string;
  auth_provider: string | null;
};

type AdminUserIdRow = {
  user_id: string;
};

type PostActivityRow = {
  id: string;
  author_id: string;
  created_at: string;
};

type CommentActivityRow = {
  id: string;
  user_id: string;
  created_at: string;
};

type AttendanceActivityRow = {
  user_id: string;
  verified_at: string;
};

type CheerActivityRow = {
  id: string;
  user_id: string;
};

type ContentReportRow = {
  id: string;
  reporter_user_id: string;
  target_type: string;
  post_id: string | null;
  comment_id: string | null;
  cheer_message_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
};

type FailedSyncRow = {
  id: string;
  job_key: string;
  status: string;
  failed_count: number | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type SyncFreshnessRow = {
  sync_key: string;
  last_attempted_at: string | null;
  last_succeeded_at: string | null;
  last_error: string | null;
};

type AdminDashboardMetricsRpcPayload = {
  generatedAt: string;
  totalProfiles: number;
  newToday: number;
  new7d: number;
  newMonth: number;
  teamDistribution: Array<{
    teamId: string | null;
    teamName: string;
    memberCount: number;
  }>;
  posts: number;
  comments: number;
  attendances: number;
  openInquiries: number;
  openReports: number;
  failedSyncCount: number;
  recentFailedSyncs: Array<{
    id: string;
    jobKey: string;
    status: string;
    failedCount: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
  }>;
  syncFreshness: Array<{
    syncKey: string;
    lastAttemptedAt: string | null;
    lastSucceededAt: string | null;
    lastError: string | null;
  }>;
};

type AdminDashboardSummaryRpcPayload = {
  generatedAt: string;
  totalProfiles: number;
  failedSyncCount: number | null;
  syncAvailable: boolean;
};

type BasicSupportInquiryRow = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
};

type EnhancedSupportInquiryRow = BasicSupportInquiryRow & {
  answer_content: string | null;
  answered_by?: string | null;
};

type SupportInquiryAdminNoteRow = {
  inquiry_id: string;
  note: string;
  created_at: string;
};

type BasicPostTargetRow = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  created_at: string;
};

type EnhancedPostTargetRow = BasicPostTargetRow & {
  moderation_status: string | null;
};

type BasicCommentTargetRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type EnhancedCommentTargetRow = BasicCommentTargetRow & {
  moderation_status: string | null;
};

type BasicCheerTargetRow = {
  id: string;
  user_id: string;
  content: string | null;
  emoticon_key: string | null;
  created_at: string;
};

type EnhancedCheerTargetRow = BasicCheerTargetRow & {
  moderation_status: string | null;
};

const PAGE_SIZE = 1_000;
const KOREA_TIME_ZONE = "Asia/Seoul";

async function collectRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => Promise<{ data: unknown; error: DatabaseError | null }>,
): Promise<CollectionResult<T>> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + PAGE_SIZE - 1);
    if (result.error) return { rows: [], error: result.error };
    if (!Array.isArray(result.data)) return { rows, error: null };

    const page = result.data as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, error: null };
    from += PAGE_SIZE;
  }
}

function koreaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dashboardBoundaries(now: Date) {
  const date = koreaDate(now);
  const todayStart = new Date(`${date}T00:00:00+09:00`);
  return {
    today: todayStart.toISOString(),
    sevenDays: new Date(todayStart.getTime() - 6 * 86_400_000).toISOString(),
    month: new Date(`${date.slice(0, 7)}-01T00:00:00+09:00`).toISOString(),
    twentyFourHours: new Date(now.getTime() - 86_400_000).toISOString(),
  };
}

function isMissingColumn(error: DatabaseError | null) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = error.message.toLowerCase();
  return message.includes("column") && (
    message.includes("does not exist") || message.includes("schema cache")
  );
}

function isMissingSchema(error: DatabaseError) {
  return error.code === "42703" || isOperationsSchemaMissing(error.code);
}

function addIssue(issues: QueryIssue[], source: string, error: DatabaseError | null) {
  if (error) issues.push({ source, error });
}

function resultMeta(issues: QueryIssue[]) {
  return {
    schemaReady: !issues.some(({ error }) => isMissingSchema(error)),
    error: issues.length === 0
      ? null
      : issues.map(({ source, error }) => `${source}: ${error.message}`).join(" | "),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isDashboardMetricsPayload(
  value: unknown,
): value is AdminDashboardMetricsRpcPayload {
  if (!isRecord(value) || typeof value.generatedAt !== "string") return false;

  const countKeys = [
    "totalProfiles", "newToday", "new7d", "newMonth", "posts", "comments",
    "attendances", "openInquiries", "openReports", "failedSyncCount",
  ] as const;
  if (countKeys.some((key) => (
    typeof value[key] !== "number" || !Number.isSafeInteger(value[key]) || value[key] < 0
  ))) return false;

  if (!Array.isArray(value.teamDistribution) || !value.teamDistribution.every((item) => (
    isRecord(item) && isNullableString(item.teamId) && typeof item.teamName === "string" &&
    typeof item.memberCount === "number" && Number.isSafeInteger(item.memberCount) && item.memberCount >= 0
  ))) return false;

  if (!Array.isArray(value.recentFailedSyncs) || !value.recentFailedSyncs.every((item) => (
    isRecord(item) && typeof item.id === "string" && typeof item.jobKey === "string" &&
    typeof item.status === "string" &&
    (item.failedCount === null || (typeof item.failedCount === "number" && Number.isSafeInteger(item.failedCount) && item.failedCount >= 0)) &&
    isNullableString(item.errorCode) && isNullableString(item.errorMessage) &&
    isNullableString(item.startedAt) && isNullableString(item.finishedAt) &&
    typeof item.createdAt === "string"
  ))) return false;

  return Array.isArray(value.syncFreshness) && value.syncFreshness.every((item) => (
    isRecord(item) && typeof item.syncKey === "string" &&
    isNullableString(item.lastAttemptedAt) && isNullableString(item.lastSucceededAt) &&
    isNullableString(item.lastError)
  ));
}

function isDashboardSummaryPayload(
  value: unknown,
): value is AdminDashboardSummaryRpcPayload {
  return isRecord(value) &&
    typeof value.generatedAt === "string" &&
    Number.isFinite(Date.parse(value.generatedAt)) &&
    typeof value.totalProfiles === "number" &&
    Number.isSafeInteger(value.totalProfiles) &&
    value.totalProfiles >= 0 &&
    (value.failedSyncCount === null || (
      typeof value.failedSyncCount === "number" &&
      Number.isSafeInteger(value.failedSyncCount) &&
      value.failedSyncCount >= 0
    )) &&
    typeof value.syncAvailable === "boolean";
}

function isMissingDashboardMetricsRpc(error: DatabaseError | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const message = error.message.toLowerCase();
  return message.includes("admin_get_dashboard_metrics") && (
    message.includes("could not find") || message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isMissingDashboardSummaryRpc(error: DatabaseError | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const message = error.message.toLowerCase();
  return message.includes("admin_get_dashboard_summary") && (
    message.includes("could not find") || message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function countValue(result: { count: number | null; error: DatabaseError | null }) {
  return result.error ? null : result.count;
}

async function getRecentFootballSyncFailureCount(
  client: SupabaseClient,
  since: string,
) {
  const result = await client
    .from("football_sync_state")
    .select("sync_key,last_attempted_at,last_succeeded_at,last_error")
    .gte("last_attempted_at", since);

  if (result.error) {
    return { count: null, error: result.error };
  }

  const rows = (result.data ?? []) as SyncFreshnessRow[];
  return {
    count: rows.filter((row) => Boolean(row.last_error?.trim())).length,
    error: null,
  };
}

function availableFailureCount(...counts: Array<number | null>) {
  const availableCounts = counts.filter((count): count is number => count !== null);
  return availableCounts.length > 0 ? Math.max(...availableCounts) : null;
}

function incrementCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function updateLatest(map: Map<string, string>, key: string, value: string) {
  const previous = map.get(key);
  if (!previous || Date.parse(value) > Date.parse(previous)) map.set(key, value);
}

function targetId(report: ContentReportRow) {
  if (report.target_type === "POST") return report.post_id;
  if (report.target_type === "COMMENT") return report.comment_id;
  if (report.target_type === "FIXTURE_CHEER") return report.cheer_message_id;
  return report.post_id ?? report.comment_id ?? report.cheer_message_id;
}

function targetKey(targetType: string, id: string) {
  return `${targetType}:${id}`;
}

async function loadTeams(client: SupabaseClient) {
  return collectRows<TeamRow>(async (from, to) => {
    const result = await client
      .from("teams")
      .select("id,name")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
}

async function loadBasicProfiles(client: SupabaseClient) {
  return collectRows<BasicProfileRow>(async (from, to) => {
    const result = await client
      .from("profiles")
      .select("id,nickname,team_id,created_at,updated_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
}

async function loadProfilesWithAccountState(client: SupabaseClient) {
  const enhanced = await collectRows<EnhancedProfileRow>(async (from, to) => {
    const result = await client
      .from("profiles")
      .select("id,nickname,team_id,created_at,updated_at,account_status,suspended_until")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });

  if (!isMissingColumn(enhanced.error)) {
    return { ...enhanced, enhancementsReady: enhanced.error === null };
  }

  const legacy = await loadBasicProfiles(client);
  return {
    rows: legacy.rows.map((row) => ({
      ...row,
      account_status: null,
      suspended_until: null,
    })),
    error: legacy.error,
    enhancementsReady: false,
  };
}

function profileSummary(
  profile: BasicProfileRow | undefined,
  teamNames: Map<string, string>,
): AdminProfileSummary | null {
  if (!profile) return null;
  return {
    id: profile.id,
    nickname: profile.nickname,
    teamId: profile.team_id,
    teamName: profile.team_id ? teamNames.get(profile.team_id) ?? null : null,
  };
}

export const getAdminDashboardSummary = cache(async (): Promise<AdminDashboardSummaryData> => {
  const client = await getOperationsClient();
  const generatedAt = new Date();
  const twentyFourHoursAgo = new Date(generatedAt.getTime() - 86_400_000).toISOString();
  const unavailable: AdminDashboardSummaryData = {
    generatedAt: generatedAt.toISOString(),
    totalProfiles: null,
    profilesError: "Supabase 연결을 확인해 주세요.",
    syncFailure24h: "unavailable",
    failedSyncCount24h: null,
    syncError: "동기화 이력을 확인할 수 없습니다.",
  };
  if (!client) return unavailable;

  const [summaryRpc, syncStateFailureResult] = await Promise.all([
    client.rpc("admin_get_dashboard_summary"),
    getRecentFootballSyncFailureCount(client, twentyFourHoursAgo),
  ]);
  if (!summaryRpc.error) {
    if (!isDashboardSummaryPayload(summaryRpc.data)) {
      return {
        ...unavailable,
        profilesError: "대시보드 집계 응답을 확인해 주세요.",
        syncError: "대시보드 집계 응답을 확인해 주세요.",
      };
    }

    const failedRunCount = summaryRpc.data.syncAvailable
      ? summaryRpc.data.failedSyncCount
      : null;
    const failedSyncCount24h = availableFailureCount(
      failedRunCount,
      syncStateFailureResult.count,
    );
    const syncAvailable = failedSyncCount24h !== null;
    return {
      generatedAt: summaryRpc.data.generatedAt,
      totalProfiles: summaryRpc.data.totalProfiles,
      profilesError: null,
      syncFailure24h: !syncAvailable
        ? "unavailable"
        : (failedSyncCount24h ?? 0) > 0
          ? "detected"
          : "none",
      failedSyncCount24h,
      syncError: syncAvailable ? null : "동기화 상태를 확인할 수 없습니다.",
    };
  }

  if (!isMissingDashboardSummaryRpc(summaryRpc.error)) {
    return {
      ...unavailable,
      profilesError: "관리자 집계 권한을 확인해 주세요.",
      syncError: "관리자 집계 권한을 확인해 주세요.",
    };
  }

  const [profilesResult, failedSyncResult] = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }),
    client
      .from("sync_runs")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "partial"])
      .gte("created_at", twentyFourHoursAgo)
      .or("status.eq.failed,failed_count.gt.0,error_code.not.is.null,error_message.not.is.null"),
  ]);

  const totalProfiles = countValue(profilesResult);
  const failedSyncCount24h = availableFailureCount(
    countValue(failedSyncResult),
    syncStateFailureResult.count,
  );
  const syncUnavailable = failedSyncCount24h === null;
  const syncError = syncUnavailable ? "동기화 상태를 확인할 수 없습니다." : null;

  return {
    generatedAt: generatedAt.toISOString(),
    totalProfiles,
    profilesError: profilesResult.error || totalProfiles === null
      ? "프로필 집계를 확인할 수 없습니다."
      : null,
    syncFailure24h: syncUnavailable
      ? "unavailable"
      : (failedSyncCount24h ?? 0) > 0
        ? "detected"
        : "none",
    failedSyncCount24h,
    syncError,
  };
});

export const getAdminDashboardAttention = cache(async (): Promise<AdminDashboardAttentionData> => {
  const client = await getOperationsClient();
  const unavailable: AdminDashboardAttentionItem = {
    count: null,
    error: "내역을 확인할 수 없습니다.",
  };
  if (!client) return { inquiries: unavailable, reports: unavailable };

  const [inquiriesResult, reportsResult] = await Promise.all([
    client
      .from("support_inquiries")
      .select("id", { count: "exact", head: true })
      .in("status", ["RECEIVED", "IN_PROGRESS"]),
    client
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["OPEN", "REVIEWED"]),
  ]);

  const attentionItem = (
    result: typeof inquiriesResult,
    error: string,
  ): AdminDashboardAttentionItem => ({
    count: result.error ? null : result.count,
    error: result.error ? error : null,
  });

  return {
    inquiries: attentionItem(inquiriesResult, "문의 내역을 확인할 수 없습니다."),
    reports: attentionItem(reportsResult, "신고 내역을 확인할 수 없습니다."),
  };
});

export const getAdminDashboardData = cache(async (
  range: AdminDashboardRange = "7d",
): Promise<AdminDashboardData> => {
  const client = await getOperationsClient();
  const generatedAt = new Date();
  const empty: AdminDashboardData = {
    range,
    generatedAt: generatedAt.toISOString(),
    totalProfiles: null,
    newToday: null,
    new7d: null,
    newMonth: null,
    selectedNewProfiles: null,
    teamDistribution: [],
    posts: null,
    comments: null,
    attendances: null,
    openInquiries: null,
    openReports: null,
    failedSyncCount: null,
    recentFailedSyncs: [],
    syncFreshness: [],
    schemaReady: false,
    enhancementsReady: true,
    error: "Supabase 환경 변수가 설정되지 않았습니다.",
    warnings: [],
  };
  if (!client) return empty;

  const dashboardRpc = await client.rpc("admin_get_dashboard_metrics");
  if (!dashboardRpc.error) {
    if (!isDashboardMetricsPayload(dashboardRpc.data)) {
      return {
        ...empty,
        schemaReady: false,
        error: "admin_get_dashboard_metrics 응답 형식이 올바르지 않습니다.",
      };
    }

    const payload = dashboardRpc.data;
    const selectedNewProfiles = range === "today"
      ? payload.newToday
      : range === "month"
        ? payload.newMonth
        : payload.new7d;
    return {
      range,
      generatedAt: payload.generatedAt,
      totalProfiles: payload.totalProfiles,
      newToday: payload.newToday,
      new7d: payload.new7d,
      newMonth: payload.newMonth,
      selectedNewProfiles,
      teamDistribution: [...payload.teamDistribution].sort((a, b) => (
        b.memberCount - a.memberCount || a.teamName.localeCompare(b.teamName, "ko")
      )),
      posts: payload.posts,
      comments: payload.comments,
      attendances: payload.attendances,
      openInquiries: payload.openInquiries,
      openReports: payload.openReports,
      failedSyncCount: payload.failedSyncCount,
      recentFailedSyncs: payload.recentFailedSyncs,
      syncFreshness: payload.syncFreshness,
      schemaReady: true,
      enhancementsReady: true,
      error: null,
      warnings: [],
    };
  }

  if (!isMissingDashboardMetricsRpc(dashboardRpc.error)) {
    return {
      ...empty,
      schemaReady: !isMissingSchema(dashboardRpc.error),
      error: `admin_get_dashboard_metrics: ${dashboardRpc.error.message}`,
    };
  }

  const dashboardFallbackWarning =
    "admin_get_dashboard_metrics RPC가 없어 기존 권한 범위의 읽기 방식으로 집계했습니다.";

  const boundaries = dashboardBoundaries(generatedAt);
  const [
    teamsResult,
    totalProfilesResult,
    newTodayResult,
    new7dResult,
    newMonthResult,
    postsResult,
    commentsResult,
    attendancesResult,
    inquiriesResult,
    reportsResult,
    failedSyncResult,
    syncFreshnessResult,
  ] = await Promise.all([
    loadTeams(client),
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", boundaries.today),
    client.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", boundaries.sevenDays),
    client.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", boundaries.month),
    client.from("posts").select("id", { count: "exact", head: true }),
    client.from("comments").select("id", { count: "exact", head: true }),
    client.from("attendances").select("id", { count: "exact", head: true }),
    client.from("support_inquiries").select("id", { count: "exact", head: true }).in("status", ["RECEIVED", "IN_PROGRESS"]),
    client.from("content_reports").select("id", { count: "exact", head: true }).in("status", ["OPEN", "REVIEWED"]),
    collectRows<FailedSyncRow>(async (from, to) => {
      const result = await client
        .from("sync_runs")
        .select("id,job_key,status,failed_count,error_code,error_message,started_at,finished_at,created_at")
        .in("status", ["failed", "partial"])
        .gte("created_at", boundaries.twentyFourHours)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    collectRows<SyncFreshnessRow>(async (from, to) => {
      const result = await client
        .from("football_sync_state")
        .select("sync_key,last_attempted_at,last_succeeded_at,last_error")
        .order("sync_key", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]);

  const issues: QueryIssue[] = [];
  addIssue(issues, "teams", teamsResult.error);
  addIssue(issues, "profiles.total", totalProfilesResult.error);
  addIssue(issues, "profiles.today", newTodayResult.error);
  addIssue(issues, "profiles.7d", new7dResult.error);
  addIssue(issues, "profiles.month", newMonthResult.error);
  addIssue(issues, "posts", postsResult.error);
  addIssue(issues, "comments", commentsResult.error);
  addIssue(issues, "attendances", attendancesResult.error);
  addIssue(issues, "support_inquiries", inquiriesResult.error);
  addIssue(issues, "content_reports", reportsResult.error);
  addIssue(issues, "sync_runs", failedSyncResult.error);
  addIssue(issues, "football_sync_state", syncFreshnessResult.error);

  const teamDistribution: AdminTeamDistributionRecord[] = [];
  if (!teamsResult.error) {
    const distributionResults = await Promise.all([
      ...teamsResult.rows.map(async (team) => ({
        team,
        result: await client
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("team_id", team.id),
      })),
      (async () => ({
        team: null,
        result: await client
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .is("team_id", null),
      }))(),
    ]);

    for (const item of distributionResults) {
      addIssue(
        issues,
        item.team ? `profiles.team.${item.team.id}` : "profiles.team.unselected",
        item.result.error,
      );
      teamDistribution.push({
        teamId: item.team?.id ?? null,
        teamName: item.team?.name ?? "응원 팀 미선택",
        memberCount: countValue(item.result),
      });
    }
    teamDistribution.sort((a, b) => {
      if (a.memberCount === null) return 1;
      if (b.memberCount === null) return -1;
      return b.memberCount - a.memberCount || a.teamName.localeCompare(b.teamName, "ko");
    });
  }

  const newToday = countValue(newTodayResult);
  const new7d = countValue(new7dResult);
  const newMonth = countValue(newMonthResult);
  const selectedNewProfiles = range === "today" ? newToday : range === "month" ? newMonth : new7d;
  const failedRows = failedSyncResult.error
    ? []
    : failedSyncResult.rows.filter((row) => (
      row.status === "failed" ||
      (row.failed_count ?? 0) > 0 ||
      Boolean(row.error_code) ||
      Boolean(row.error_message)
    ));
  const meta = resultMeta(issues);

  return {
    range,
    generatedAt: generatedAt.toISOString(),
    totalProfiles: countValue(totalProfilesResult),
    newToday,
    new7d,
    newMonth,
    selectedNewProfiles,
    teamDistribution,
    posts: countValue(postsResult),
    comments: countValue(commentsResult),
    attendances: countValue(attendancesResult),
    openInquiries: countValue(inquiriesResult),
    openReports: countValue(reportsResult),
    failedSyncCount: failedSyncResult.error ? null : failedRows.length,
    recentFailedSyncs: failedRows.slice(0, 10).map((row) => ({
      id: row.id,
      jobKey: row.job_key,
      status: row.status,
      failedCount: row.failed_count,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    })),
    syncFreshness: syncFreshnessResult.error ? [] : syncFreshnessResult.rows.map((row) => ({
      syncKey: row.sync_key,
      lastAttemptedAt: row.last_attempted_at,
      lastSucceededAt: row.last_succeeded_at,
      lastError: row.last_error,
    })),
    ...meta,
    enhancementsReady: true,
    warnings: [dashboardFallbackWarning],
  };
});

function isMissingAdminUsersRpc(error: DatabaseError | null) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const message = error.message.toLowerCase();
  return message.includes("admin_get_users") && (
    message.includes("could not find") || message.includes("does not exist")
  );
}

async function loadAdminUsersRpc(client: SupabaseClient) {
  const rows: AdminUsersRpcRow[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const result = await client.rpc("admin_get_users", {
      p_query: null,
      p_limit: limit,
      p_offset: offset,
    });
    if (result.error) {
      return {
        rows: [] as AdminUsersRpcRow[],
        error: result.error,
        missing: isMissingAdminUsersRpc(result.error),
      };
    }

    const page = Array.isArray(result.data) ? result.data as AdminUsersRpcRow[] : [];
    rows.push(...page);
    if (page.length < limit) return { rows, error: null, missing: false };
    if (offset >= 100_000) {
      return {
        rows: [] as AdminUsersRpcRow[],
        error: {
          code: "ADMIN_USERS_RPC_OFFSET_LIMIT",
          message: "admin_get_users가 지원하는 최대 오프셋을 초과했습니다.",
        },
        missing: false,
      };
    }
    offset += limit;
  }
}

async function loadAdminUserAuthProviders(client: SupabaseClient) {
  const serviceConnection = getSupabaseConnection();
  if (serviceConnection.client && serviceConnection.hasServiceRole) {
    const providers = new Map<string, string>();
    const perPage = 1_000;

    for (let page = 1; page <= 100; page += 1) {
      const result = await serviceConnection.client.auth.admin.listUsers({ page, perPage });
      if (result.error) break;

      for (const user of result.data.users) {
        const identityProviders = (user.identities ?? [])
          .map((identity) => identity.provider.toLowerCase());
        const metadataProvider = typeof user.app_metadata.provider === "string"
          ? user.app_metadata.provider.toLowerCase()
          : null;
        const provider = identityProviders.find((value) => value === "kakao")
          ?? identityProviders.find((value) => value === "apple")
          ?? identityProviders[0]
          ?? metadataProvider;
        if (provider) providers.set(user.id, provider);
      }

      if (result.data.users.length < perPage) return providers;
    }
  }

  const result = await client.rpc("admin_get_user_auth_providers");
  if (result.error) return new Map<string, string>();

  return new Map(
    ((result.data ?? []) as AdminUserAuthProviderRpcRow[])
      .filter((row) => typeof row.user_id === "string" && typeof row.auth_provider === "string")
      .map((row) => [row.user_id, row.auth_provider as string]),
  );
}

async function loadAdminUserIds(client: SupabaseClient) {
  const serviceConnection = getSupabaseConnection();
  if (serviceConnection.client && serviceConnection.hasServiceRole) {
    const result = await serviceConnection.client
      .from("admin_users")
      .select("user_id");
    if (!result.error) {
      return new Set(
        ((result.data ?? []) as AdminUserIdRow[]).map((row) => row.user_id),
      );
    }
  }

  const rpcResult = await client.rpc("admin_get_admin_user_ids");
  if (!rpcResult.error) {
    return new Set(
      ((rpcResult.data ?? []) as AdminUserIdRow[]).map((row) => row.user_id),
    );
  }

  const directResult = await client.from("admin_users").select("user_id");
  if (directResult.error) return new Set<string>();
  return new Set(
    ((directResult.data ?? []) as AdminUserIdRow[]).map((row) => row.user_id),
  );
}

export const getAdminUsersData = cache(async (): Promise<AdminUsersData> => {
  const client = await getOperationsClient();
  if (!client) {
    return {
      users: [],
      schemaReady: false,
      enhancementsReady: false,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
      warnings: [],
    };
  }

  const rpcResult = await loadAdminUsersRpc(client);
  if (!rpcResult.missing) {
    if (rpcResult.error) {
      return {
        users: [],
        schemaReady: !isMissingSchema(rpcResult.error),
        enhancementsReady: false,
        error: `admin_get_users: ${rpcResult.error.message}`,
        warnings: [],
      };
    }
    const [authProviders, adminUserIds] = await Promise.all([
      loadAdminUserAuthProviders(client),
      loadAdminUserIds(client),
    ]);
    return {
      users: rpcResult.rows
        .filter((row) => !adminUserIds.has(row.user_id))
        .map((row) => ({
          id: row.user_id,
          nickname: row.nickname,
          teamId: row.team_id,
          teamName: row.team_name,
          authProvider: authProviders.get(row.user_id) ?? null,
          createdAt: row.joined_at,
          updatedAt: null,
          postCount: row.post_count,
          commentCount: row.comment_count,
          attendanceCount: row.attendance_count,
          reportCount: row.received_report_count,
          warningCount: row.warning_count,
          recentActivityAt: row.recent_activity_at,
          accountStatus: row.account_status,
          suspendedUntil: row.suspended_until,
        })),
      schemaReady: true,
      enhancementsReady: true,
      error: null,
      warnings: [],
    };
  }

  const [authProviders, adminUserIds, profilesResult] = await Promise.all([
    loadAdminUserAuthProviders(client),
    loadAdminUserIds(client),
    loadProfilesWithAccountState(client),
  ]);
  const [teamsResult, postsResult, commentsResult, attendancesResult, reportsResult, cheersResult] = await Promise.all([
    loadTeams(client),
    collectRows<PostActivityRow>(async (from, to) => {
      const result = await client
        .from("posts")
        .select("id,author_id,created_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    collectRows<CommentActivityRow>(async (from, to) => {
      const result = await client
        .from("comments")
        .select("id,user_id,created_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    collectRows<AttendanceActivityRow>(async (from, to) => {
      const result = await client
        .from("attendances")
        .select("user_id,verified_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    collectRows<ContentReportRow>(async (from, to) => {
      const result = await client
        .from("content_reports")
        .select("id,reporter_user_id,target_type,post_id,comment_id,cheer_message_id,reason,details,status,created_at,reviewed_at")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    collectRows<CheerActivityRow>(async (from, to) => {
      const result = await client
        .from("fixture_cheer_messages")
        .select("id,user_id")
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]);

  const issues: QueryIssue[] = [];
  addIssue(issues, "profiles", profilesResult.error);
  addIssue(issues, "teams", teamsResult.error);
  addIssue(issues, "posts", postsResult.error);
  addIssue(issues, "comments", commentsResult.error);
  addIssue(issues, "attendances", attendancesResult.error);
  addIssue(issues, "content_reports", reportsResult.error);
  addIssue(issues, "fixture_cheer_messages", cheersResult.error);

  const teamNames = new Map(teamsResult.rows.map((team) => [team.id, team.name]));
  const postCounts = new Map<string, number>();
  const commentCounts = new Map<string, number>();
  const attendanceCounts = new Map<string, number>();
  const reportCounts = new Map<string, number>();
  const latestActivity = new Map<string, string>();
  const postAuthors = new Map<string, string>();
  const commentAuthors = new Map<string, string>();
  const cheerAuthors = new Map<string, string>();

  if (!postsResult.error) {
    for (const post of postsResult.rows) {
      incrementCount(postCounts, post.author_id);
      updateLatest(latestActivity, post.author_id, post.created_at);
      postAuthors.set(post.id, post.author_id);
    }
  }
  if (!commentsResult.error) {
    for (const comment of commentsResult.rows) {
      incrementCount(commentCounts, comment.user_id);
      updateLatest(latestActivity, comment.user_id, comment.created_at);
      commentAuthors.set(comment.id, comment.user_id);
    }
  }
  if (!attendancesResult.error) {
    for (const attendance of attendancesResult.rows) {
      incrementCount(attendanceCounts, attendance.user_id);
      updateLatest(latestActivity, attendance.user_id, attendance.verified_at);
    }
  }
  if (!cheersResult.error) {
    for (const cheer of cheersResult.rows) cheerAuthors.set(cheer.id, cheer.user_id);
  }

  const reportCountsReady = !reportsResult.error && !postsResult.error &&
    !commentsResult.error && !cheersResult.error;
  if (reportCountsReady) {
    for (const report of reportsResult.rows) {
      const id = targetId(report);
      if (!id) continue;
      const authorId = report.target_type === "POST"
        ? postAuthors.get(id)
        : report.target_type === "COMMENT"
          ? commentAuthors.get(id)
          : cheerAuthors.get(id);
      if (authorId) incrementCount(reportCounts, authorId);
    }
  }

  const activityReady = !postsResult.error && !commentsResult.error && !attendancesResult.error;
  const meta = resultMeta(issues);
  return {
    users: profilesResult.error ? [] : profilesResult.rows
      .filter((profile) => !adminUserIds.has(profile.id))
      .map((profile) => ({
        id: profile.id,
        nickname: profile.nickname,
        teamId: profile.team_id,
        teamName: profile.team_id ? teamNames.get(profile.team_id) ?? null : null,
        authProvider: authProviders.get(profile.id) ?? null,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        postCount: postsResult.error ? null : postCounts.get(profile.id) ?? 0,
        commentCount: commentsResult.error ? null : commentCounts.get(profile.id) ?? 0,
        attendanceCount: attendancesResult.error ? null : attendanceCounts.get(profile.id) ?? 0,
        reportCount: reportCountsReady ? reportCounts.get(profile.id) ?? 0 : null,
        warningCount: null,
        recentActivityAt: activityReady ? latestActivity.get(profile.id) ?? null : null,
        accountStatus: profile.account_status,
        suspendedUntil: profile.suspended_until,
      })),
    ...meta,
    enhancementsReady: profilesResult.enhancementsReady,
    warnings: [
      "admin_get_users RPC가 없어 기존 테이블 집계로 조회했습니다.",
      ...(!profilesResult.enhancementsReady
        ? ["profiles.account_status와 profiles.suspended_until이 없어 레거시 프로필 스키마로 조회했습니다."]
        : []),
    ],
  };
});

async function loadSupportInquiries(client: SupabaseClient) {
  const enhanced = await collectRows<EnhancedSupportInquiryRow>(async (from, to) => {
    const result = await client
      .from("support_inquiries")
      .select("id,user_id,category,subject,content,status,answer_content,created_at,updated_at,answered_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  if (!isMissingColumn(enhanced.error)) {
    return { ...enhanced, enhancementsReady: enhanced.error === null };
  }

  const legacy = await collectRows<BasicSupportInquiryRow>(async (from, to) => {
    const result = await client
      .from("support_inquiries")
      .select("id,user_id,category,subject,content,status,created_at,updated_at,answered_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  return {
    rows: legacy.rows.map((row) => ({
      ...row,
      answer_content: null,
      answered_by: null,
    })),
    error: legacy.error,
    enhancementsReady: false,
  };
}

async function loadSupportInquiryAdminNotes(client: SupabaseClient) {
  return collectRows<SupportInquiryAdminNoteRow>(async (from, to) => {
    const result = await client
      .from("support_inquiry_admin_notes")
      .select("inquiry_id,note,created_at")
      .order("created_at", { ascending: false })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
}

export const getSupportInquiryData = cache(async (): Promise<AdminSupportInquiryData> => {
  const client = await getOperationsClient();
  if (!client) {
    return {
      inquiries: [],
      schemaReady: false,
      enhancementsReady: false,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
      warnings: [],
    };
  }

  const [inquiriesResult, profilesResult, teamsResult] = await Promise.all([
    loadSupportInquiries(client),
    loadBasicProfiles(client),
    loadTeams(client),
  ]);
  const notesResult = inquiriesResult.error
    ? { rows: [] as SupportInquiryAdminNoteRow[], error: null }
    : await loadSupportInquiryAdminNotes(client);
  const issues: QueryIssue[] = [];
  addIssue(issues, "support_inquiries", inquiriesResult.error);
  addIssue(issues, "profiles", profilesResult.error);
  addIssue(issues, "teams", teamsResult.error);
  const profiles = new Map(profilesResult.rows.map((profile) => [profile.id, profile]));
  const teamNames = new Map(teamsResult.rows.map((team) => [team.id, team.name]));
  const latestAdminNotes = new Map<string, string>();
  if (!notesResult.error) {
    for (const note of notesResult.rows) {
      if (!latestAdminNotes.has(note.inquiry_id)) latestAdminNotes.set(note.inquiry_id, note.note);
    }
  }
  const meta = resultMeta(issues);

  return {
    inquiries: inquiriesResult.error ? [] : inquiriesResult.rows.map((inquiry) => ({
      id: inquiry.id,
      userId: inquiry.user_id,
      requester: profileSummary(profiles.get(inquiry.user_id), teamNames),
      category: inquiry.category,
      subject: inquiry.subject,
      content: inquiry.content,
      status: inquiry.status,
      adminNote: latestAdminNotes.get(inquiry.id) ?? null,
      answer: inquiry.answer_content,
      answeredBy: inquiry.answered_by ?? null,
      createdAt: inquiry.created_at,
      updatedAt: inquiry.updated_at,
      answeredAt: inquiry.answered_at,
    })),
    ...meta,
    enhancementsReady: inquiriesResult.enhancementsReady,
    warnings: [
      ...(!inquiriesResult.enhancementsReady
        ? ["support_inquiries.answer_content가 없어 레거시 문의 스키마로 조회했습니다."]
        : []),
      ...(notesResult.error
        ? ["support_inquiry_admin_notes 직접 조회 권한이 없어 관리자 메모는 표시하지 않습니다."]
        : []),
    ],
  };
});

export const getSupportInquiryDetail = cache(async (inquiryId: string): Promise<AdminSupportInquiryDetailData> => {
  const client = await getOperationsClient();
  if (client) {
    const result = await client.rpc("admin_get_support_inquiry", { p_inquiry_id: inquiryId });
    if (!result.error && result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
      const row = result.data as Record<string, unknown>;
      const author = row.author && typeof row.author === "object" && !Array.isArray(row.author) ? row.author as Record<string, unknown> : null;
      const notes = Array.isArray(row.adminNotes) ? row.adminNotes : [];
      const userId = String(row.userId);
      return {
        inquiry: {
          id: String(row.id), userId,
          requester: author ? { id: userId, nickname: String(author.nickname ?? ""), teamId: author.teamId == null ? null : String(author.teamId), teamName: author.teamName == null ? null : String(author.teamName) } : null,
          category: String(row.category), subject: String(row.subject), content: String(row.content), status: String(row.status),
          adminNote: notes.length > 0 && notes.at(-1) && typeof notes.at(-1) === "object" ? String((notes.at(-1) as Record<string, unknown>).note ?? "") : null,
          answer: row.answerContent == null ? null : String(row.answerContent), answeredBy: row.answeredBy == null ? null : String(row.answeredBy),
          createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), answeredAt: row.answeredAt == null ? null : String(row.answeredAt),
        },
        adminNotes: notes.filter((note): note is Record<string, unknown> => Boolean(note) && typeof note === "object" && !Array.isArray(note)).map((note) => ({ id: String(note.id), note: String(note.note), createdBy: note.createdBy == null ? null : String(note.createdBy), createdAt: String(note.createdAt) })),
        schemaReady: true, enhancementsReady: true, error: null,
      };
    }
  }
  const fallback = await getSupportInquiryData();
  return { inquiry: fallback.inquiries.find((item) => item.id === inquiryId) ?? null, adminNotes: [], schemaReady: fallback.schemaReady, enhancementsReady: fallback.enhancementsReady, error: fallback.error };
});

async function loadPostTargets(client: SupabaseClient) {
  const enhanced = await collectRows<EnhancedPostTargetRow>(async (from, to) => {
    const result = await client
      .from("posts")
      .select("id,author_id,title,content,created_at,moderation_status")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  if (!isMissingColumn(enhanced.error)) {
    return { ...enhanced, enhancementsReady: enhanced.error === null };
  }
  const legacy = await collectRows<BasicPostTargetRow>(async (from, to) => {
    const result = await client
      .from("posts")
      .select("id,author_id,title,content,created_at")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  return {
    rows: legacy.rows.map((row) => ({ ...row, moderation_status: null })),
    error: legacy.error,
    enhancementsReady: false,
  };
}

async function loadCommentTargets(client: SupabaseClient) {
  const enhanced = await collectRows<EnhancedCommentTargetRow>(async (from, to) => {
    const result = await client
      .from("comments")
      .select("id,user_id,content,created_at,moderation_status")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  if (!isMissingColumn(enhanced.error)) {
    return { ...enhanced, enhancementsReady: enhanced.error === null };
  }
  const legacy = await collectRows<BasicCommentTargetRow>(async (from, to) => {
    const result = await client
      .from("comments")
      .select("id,user_id,content,created_at")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  return {
    rows: legacy.rows.map((row) => ({ ...row, moderation_status: null })),
    error: legacy.error,
    enhancementsReady: false,
  };
}

async function loadCheerTargets(client: SupabaseClient) {
  const enhanced = await collectRows<EnhancedCheerTargetRow>(async (from, to) => {
    const result = await client
      .from("fixture_cheer_messages")
      .select("id,user_id,content,emoticon_key,created_at,moderation_status")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  if (!isMissingColumn(enhanced.error)) {
    return { ...enhanced, enhancementsReady: enhanced.error === null };
  }
  const legacy = await collectRows<BasicCheerTargetRow>(async (from, to) => {
    const result = await client
      .from("fixture_cheer_messages")
      .select("id,user_id,content,emoticon_key,created_at")
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data, error: result.error };
  });
  return {
    rows: legacy.rows.map((row) => ({ ...row, moderation_status: null })),
    error: legacy.error,
    enhancementsReady: false,
  };
}

export const getModerationData = cache(async (): Promise<AdminModerationData> => {
  const client = await getOperationsClient();
  if (!client) {
    return {
      reports: [],
      schemaReady: false,
      enhancementsReady: false,
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
      warnings: [],
    };
  }

  const [reportsResult, profilesResult, teamsResult, postsResult, commentsResult, cheersResult] = await Promise.all([
    collectRows<ContentReportRow>(async (from, to) => {
      const result = await client
        .from("content_reports")
        .select("id,reporter_user_id,target_type,post_id,comment_id,cheer_message_id,reason,details,status,created_at,reviewed_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    loadBasicProfiles(client),
    loadTeams(client),
    loadPostTargets(client),
    loadCommentTargets(client),
    loadCheerTargets(client),
  ]);

  const issues: QueryIssue[] = [];
  addIssue(issues, "content_reports", reportsResult.error);
  addIssue(issues, "profiles", profilesResult.error);
  addIssue(issues, "teams", teamsResult.error);
  addIssue(issues, "posts", postsResult.error);
  addIssue(issues, "comments", commentsResult.error);
  addIssue(issues, "fixture_cheer_messages", cheersResult.error);

  const teamNames = new Map(teamsResult.rows.map((team) => [team.id, team.name]));
  const profiles = new Map(profilesResult.rows.map((profile) => [profile.id, profile]));
  const posts = new Map(postsResult.rows.map((post) => [post.id, post]));
  const comments = new Map(commentsResult.rows.map((comment) => [comment.id, comment]));
  const cheers = new Map(cheersResult.rows.map((cheer) => [cheer.id, cheer]));
  const cumulativeCounts = new Map<string, number>();

  if (!reportsResult.error) {
    for (const report of reportsResult.rows) {
      const id = targetId(report);
      if (id) incrementCount(cumulativeCounts, targetKey(report.target_type, id));
    }
  }

  const buildTarget = (report: ContentReportRow): AdminModerationTarget | null => {
    const id = targetId(report);
    if (!id) return null;
    if (report.target_type === "POST") {
      const post = posts.get(id);
      if (!post) return null;
      return {
        id,
        type: report.target_type,
        title: post.title,
        content: post.content,
        emoticonKey: null,
        author: profileSummary(profiles.get(post.author_id), teamNames),
        createdAt: post.created_at,
        moderationStatus: post.moderation_status,
      };
    }
    if (report.target_type === "COMMENT") {
      const comment = comments.get(id);
      if (!comment) return null;
      return {
        id,
        type: report.target_type,
        title: null,
        content: comment.content,
        emoticonKey: null,
        author: profileSummary(profiles.get(comment.user_id), teamNames),
        createdAt: comment.created_at,
        moderationStatus: comment.moderation_status,
      };
    }
    if (report.target_type === "FIXTURE_CHEER") {
      const cheer = cheers.get(id);
      if (!cheer) return null;
      return {
        id,
        type: report.target_type,
        title: null,
        content: cheer.content,
        emoticonKey: cheer.emoticon_key,
        author: profileSummary(profiles.get(cheer.user_id), teamNames),
        createdAt: cheer.created_at,
        moderationStatus: cheer.moderation_status,
      };
    }
    return null;
  };

  const enhancementsReady = postsResult.enhancementsReady &&
    commentsResult.enhancementsReady && cheersResult.enhancementsReady;
  const meta = resultMeta(issues);
  return {
    reports: reportsResult.error ? [] : reportsResult.rows.map((report) => {
      const id = targetId(report);
      return {
        id: report.id,
        reporter: profileSummary(profiles.get(report.reporter_user_id), teamNames),
        targetType: report.target_type,
        targetId: id,
        target: buildTarget(report),
        reason: report.reason,
        details: report.details,
        status: report.status,
        cumulativeReportCount: id
          ? cumulativeCounts.get(targetKey(report.target_type, id)) ?? 0
          : 0,
        createdAt: report.created_at,
        reviewedAt: report.reviewed_at,
      };
    }),
    ...meta,
    enhancementsReady,
    warnings: enhancementsReady
      ? []
      : ["신고 대상 콘텐츠의 moderation_status가 없어 레거시 콘텐츠 스키마로 조회했습니다."],
  };
});

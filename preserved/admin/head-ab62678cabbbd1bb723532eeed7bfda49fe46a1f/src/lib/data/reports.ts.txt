import "server-only";

import { CURRENT_SEASON, SUPPORTED_LEAGUE_IDS, seasonBounds, playerHref } from "@/lib/football/config";
import { fetchAllRows } from "./pagination";
import { getPlayerData } from "./operations";
import { cache } from "react";
import { getTeamName } from "./catalog";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";
import { getSupabaseConnection } from "./supabase";

export type ReportStatus = "open" | "in_review" | "resolved" | "rejected" | "on_hold";
export type ReportPriority = "low" | "normal" | "high" | "urgent";
export type ReportEntityType = "team" | "player" | "fixture" | "standing" | "ranking" | "other";

export function reportStatusLabel(value: ReportStatus | "all") {
  return ({ all: "전체", open: "신규", in_review: "확인 중", on_hold: "보류", resolved: "수정 완료", rejected: "정상 데이터" } as const)[value];
}

export function reportPriorityLabel(value: ReportPriority | "all") {
  return ({ all: "전체", low: "낮음", normal: "보통", high: "높음", urgent: "긴급" } as const)[value];
}

export type UserReportRecord = {
  id: string;
  reporterId: string;
  entityType: ReportEntityType;
  entityId: string | null;
  fieldPath: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  description: string;
  evidenceUrls: string[];
  status: ReportStatus;
  priority: ReportPriority;
  assigneeId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReportHistoryRecord = {
  id: number;
  fromStatus: ReportStatus | null;
  toStatus: ReportStatus;
  note: string | null;
  changedBy: string | null;
  createdAt: string;
};

export type ReportDetailData = {
  report: UserReportRecord | null;
  history: ReportHistoryRecord[];
  entityContext: ReportEntityContext | null;
  schemaReady: boolean;
  error: string | null;
};

export type ReportEntityContext = {
  name: string;
  href: string | null;
  syncHref: string | null;
  teamId: string | null;
};

export type ReportQueueFilters = {
  status: ReportStatus | "all";
  priority: ReportPriority | "all";
  entityType: ReportEntityType | "all";
  query: string;
  page: number;
};

export type ReportQueueItem = Pick<UserReportRecord,
  "id" | "reporterId" | "entityType" | "entityId" | "fieldPath" | "description" | "status" | "priority" | "assigneeId" | "createdAt" | "updatedAt"
> & {
  entityName: string;
  entityHref: string | null;
  syncHref: string | null;
};

export type ReportQueueData = {
  reports: ReportQueueItem[];
  total: number | null;
  matchedTotal: number;
  page: number;
  pageCount: number;
  summary: { actionable: number | null; inReview: number | null; urgent: number | null; completed: number | null };
  schemaReady: boolean;
  error: string | null;
  truncated: boolean;
};

const reportSelect = "id,reporter_id,entity_type,entity_id,field_path,current_value,proposed_value,description,evidence_urls,status,priority,assignee_id,resolution_note,resolved_at,created_at,updated_at";

function mapReport(row: Record<string, unknown>): UserReportRecord {
  return {
    id: String(row.id), reporterId: String(row.reporter_id), entityType: row.entity_type as ReportEntityType,
    entityId: row.entity_id ? String(row.entity_id) : null, fieldPath: row.field_path ? String(row.field_path) : null,
    currentValue: row.current_value, proposedValue: row.proposed_value, description: String(row.description),
    evidenceUrls: Array.isArray(row.evidence_urls) ? row.evidence_urls.filter((value): value is string => typeof value === "string") : [],
    status: row.status as ReportStatus, priority: row.priority as ReportPriority,
    assigneeId: row.assignee_id ? String(row.assignee_id) : null,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function fixtureName(homeTeamId: string, awayTeamId: string, kickoffAt: string) {
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(kickoffAt));
  return `${getTeamName(homeTeamId)} vs ${getTeamName(awayTeamId)} · ${date}`;
}

function reportSyncHref(report: Pick<UserReportRecord, "entityType" | "entityId" | "fieldPath">, teamId: string | null) {
  if (report.entityType === "player" || report.entityType === "ranking") {
    return teamId ? `/sync?operation=team-squad&teamId=${encodeURIComponent(teamId)}` : null;
  }
  if (report.entityType === "team" && report.entityId) return `/sync?operation=team-squad&teamId=${encodeURIComponent(report.entityId)}`;
  if (report.entityType === "fixture" && report.entityId) {
    return /lineup|formation|starter|substitute|선발|라인업|후보/i.test(report.fieldPath ?? "")
      ? `/sync?operation=fixture-lineup&fixtureId=${encodeURIComponent(report.entityId)}`
      : "/sync?operation=post-match";
  }
  if (report.entityType === "standing") return "/sync?operation=post-match";
  return null;
}

function queueUnavailable(message: string, schemaReady = false): ReportQueueData {
  return { reports: [], total: null, matchedTotal: 0, page: 1, pageCount: 1, summary: { actionable: null, inReview: null, urgent: null, completed: null }, schemaReady, error: message, truncated: false };
}

export async function getReportQueueData(filters: ReportQueueFilters): Promise<ReportQueueData> {
  const operationsClient = await getOperationsClient();
  if (!operationsClient) return queueUnavailable("Supabase 환경 변수가 설정되지 않았습니다.");

  let reportsQuery = operationsClient.from("user_data_reports").select(reportSelect, { count: "exact" });
  if (filters.status !== "all") reportsQuery = reportsQuery.eq("status", filters.status);
  if (filters.priority !== "all") reportsQuery = reportsQuery.eq("priority", filters.priority);
  if (filters.entityType !== "all") reportsQuery = reportsQuery.eq("entity_type", filters.entityType);

  const publicClient = getSupabaseConnection().client;
  const [reportsResult, actionableResult, inReviewResult, urgentResult, completedResult, teamsResult, playersResult, fixturesResult] = await Promise.all([
    reportsQuery.order("created_at", { ascending: false }).range(0, 499),
    operationsClient.from("user_data_reports").select("id", { count: "exact", head: true }).in("status", ["open", "in_review", "on_hold"]),
    operationsClient.from("user_data_reports").select("id", { count: "exact", head: true }).eq("status", "in_review"),
    operationsClient.from("user_data_reports").select("id", { count: "exact", head: true }).eq("priority", "urgent").in("status", ["open", "in_review", "on_hold"]),
    operationsClient.from("user_data_reports").select("id", { count: "exact", head: true }).in("status", ["resolved", "rejected"]),
    publicClient ? publicClient.from("teams").select("id,name,short_name") : Promise.resolve({ data: null, error: null }),
    publicClient ? fetchAllRows((from, to) => publicClient.from("team_players").select("player_id,player_name,display_name,display_name_ko,team_id").eq("season", CURRENT_SEASON).in("league_id", SUPPORTED_LEAGUE_IDS).order("league_id").order("team_id").order("player_id").range(from, to)) : Promise.resolve({ data: null, error: null }),
    publicClient ? fetchAllRows((from, to) => publicClient.from("fixtures").select("id,home_team_id,away_team_id,kickoff_at").gte("kickoff_at", seasonBounds().start).lt("kickoff_at", seasonBounds().end).in("league_id", SUPPORTED_LEAGUE_IDS).order("id").range(from, to)) : Promise.resolve({ data: null, error: null }),
  ]);

  if (reportsResult.error) {
    const missing = isOperationsSchemaMissing(reportsResult.error.code);
    return queueUnavailable(missing ? "사용자 제보 운영 스키마 적용이 필요합니다." : "사용자 제보를 조회할 수 없습니다.", !missing);
  }

  const teamMap = new Map((teamsResult.data ?? []).map((row) => [String(row.id), String(row.name ?? row.short_name ?? getTeamName(String(row.id)))]));
  const playerIdCounts = new Map<string, number>();
  for (const player of playersResult.data ?? []) playerIdCounts.set(player.player_id, (playerIdCounts.get(player.player_id) ?? 0) + 1);
  const playerMap = new Map((playersResult.data ?? []).filter((row) => playerIdCounts.get(row.player_id) === 1).map((row) => [String(row.player_id), {
    name: String(row.display_name_ko ?? row.display_name ?? row.player_name ?? row.player_id), teamId: String(row.team_id),
  }]));
  const fixtureMap = new Map((fixturesResult.data ?? []).map((row) => [String(row.id), fixtureName(String(row.home_team_id), String(row.away_team_id), String(row.kickoff_at))]));
  const mapped = ((reportsResult.data ?? []) as Array<Record<string, unknown>>).map(mapReport).map((report): ReportQueueItem => {
    const player = report.entityId ? playerMap.get(report.entityId) : null;
    const teamId = report.entityType === "player" || report.entityType === "ranking" ? player?.teamId ?? null
      : report.entityType === "team" || report.entityType === "standing" ? report.entityId : null;
    const entityName = !report.entityId ? "대상 미지정"
      : report.entityType === "team" || report.entityType === "standing" ? teamMap.get(report.entityId) ?? getTeamName(report.entityId)
        : report.entityType === "player" || report.entityType === "ranking" ? player?.name ?? report.entityId
          : report.entityType === "fixture" ? fixtureMap.get(report.entityId) ?? report.entityId
            : report.entityId;
    return { ...report, entityName, entityHref: reportEntityHref(report), syncHref: reportSyncHref(report, teamId) };
  });
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  const matchedReports = query ? mapped.filter((report) => [report.description, report.entityName, report.entityId, report.fieldPath]
    .some((value) => value?.toLocaleLowerCase("ko-KR").includes(query))) : mapped;
  const pageCount = Math.max(1, Math.ceil(matchedReports.length / 50));
  const page = Math.min(Math.max(1, filters.page), pageCount);
  const reports = matchedReports.slice((page - 1) * 50, page * 50);

  return {
    reports,
    total: reportsResult.count,
    matchedTotal: matchedReports.length,
    page,
    pageCount,
    summary: {
      actionable: actionableResult.error ? null : actionableResult.count,
      inReview: inReviewResult.error ? null : inReviewResult.count,
      urgent: urgentResult.error ? null : urgentResult.count,
      completed: completedResult.error ? null : completedResult.count,
    },
    schemaReady: true,
    error: null,
    truncated: (reportsResult.count ?? 0) > 500,
  };
}

export const getReportDetail = cache(async (reportId: string): Promise<ReportDetailData> => {
  const client = await getOperationsClient();
  if (!client) return { report: null, history: [], entityContext: null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const [reportResult, historyResult] = await Promise.all([
    client.from("user_data_reports")
      .select(reportSelect)
      .eq("id", reportId).maybeSingle(),
    client.from("user_data_report_history").select("id,from_status,to_status,note,changed_by,created_at").eq("report_id", reportId).order("created_at", { ascending: false }),
  ]);
  const firstError = reportResult.error || historyResult.error;
  if (firstError) return {
    report: null, history: [], entityContext: null, schemaReady: !isOperationsSchemaMissing(firstError.code),
    error: isOperationsSchemaMissing(firstError.code) ? "사용자 제보 운영 스키마 적용이 필요합니다." : "제보 상세를 조회할 수 없습니다.",
  };
  const row = reportResult.data;
  const report = row ? mapReport(row as Record<string, unknown>) : null;
  const entityContext = report ? await resolveReportEntityContext(report) : null;
  return {
    report,
    history: (historyResult.data ?? []).map((history) => ({
      id: history.id, fromStatus: history.from_status as ReportStatus | null, toStatus: history.to_status as ReportStatus,
      note: history.note, changedBy: history.changed_by, createdAt: history.created_at,
    })),
    entityContext, schemaReady: true, error: null,
  };
});

async function resolveReportEntityContext(report: UserReportRecord): Promise<ReportEntityContext | null> {
  if (!report.entityId) return null;
  const publicClient = getSupabaseConnection().client;
  if (report.entityType === "team" || report.entityType === "standing") {
    const result = publicClient ? await publicClient.from("teams").select("name,short_name").eq("id", report.entityId).maybeSingle() : null;
    return { name: String(result?.data?.name ?? result?.data?.short_name ?? getTeamName(report.entityId)), href: reportEntityHref(report), syncHref: reportSyncHref(report, report.entityId), teamId: report.entityId };
  }
  if (report.entityType === "player" || report.entityType === "ranking") {
    const result = await getPlayerData(report.entityId);
    const player = result.data;
    const teamId = player?.teamId ?? null;
    return { name: player?.koreanName ?? player?.displayName ?? player?.name ?? "리그 확인 필요", href: player ? playerHref(player) : reportEntityHref(report), syncHref: player ? `/sync?operation=team-squad&teamId=${encodeURIComponent(player.teamId)}&leagueId=${encodeURIComponent(player.leagueId)}` : null, teamId };
  }
  if (report.entityType === "fixture") {
    const result = publicClient ? await publicClient.from("fixtures").select("home_team_id,away_team_id,kickoff_at").eq("id", report.entityId).maybeSingle() : null;
    const name = result?.data ? fixtureName(String(result.data.home_team_id), String(result.data.away_team_id), String(result.data.kickoff_at)) : report.entityId;
    return { name, href: reportEntityHref(report), syncHref: reportSyncHref(report, null), teamId: null };
  }
  return { name: report.entityId, href: reportEntityHref(report), syncHref: null, teamId: null };
}

export function reportEntityHref(report: UserReportRecord) {
  if (!report.entityId) return null;
  const id = encodeURIComponent(report.entityId);
  if (report.entityType === "team") return `/standings/detail/?teamId=${id}`;
  if (report.entityType === "player") return `/squads/detail/?playerId=${id}`;
  if (report.entityType === "fixture") return `/schedules/detail/?fixtureId=${id}`;
  if (report.entityType === "standing") return `/standings/detail/?teamId=${id}`;
  if (report.entityType === "ranking") return `/squads/detail/?playerId=${id}`;
  return null;
}

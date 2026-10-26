import "server-only";

import { cache } from "react";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type ErrorRange = "1h" | "24h" | "7d" | "30d";

export type ErrorGroupRecord = {
  id: string;
  fingerprint: string;
  source: string;
  title: string;
  errorType: string | null;
  severity: "info" | "warning" | "error" | "fatal";
  status: "open" | "investigating" | "resolved" | "ignored";
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  affectedUserCount: number | null;
  latestRelease: string | null;
  latestEnvironment: string | null;
  latestOsName: string | null;
  latestOsVersion: string | null;
  latestDeviceModel: string | null;
  latestRoute: string | null;
  latestApiEndpoint: string | null;
  latestHttpStatus: number | null;
  assigneeId: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type ErrorEventRecord = {
  id: string;
  occurredAt: string;
  environment: string | null;
  release: string | null;
  errorType: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  route: string | null;
  apiEndpoint: string | null;
  httpStatus: number | null;
  operation: string | null;
  message: string | null;
  stackTrace: string | null;
  userIdHash: string | null;
  requestId: string | null;
  sanitizedContext: Record<string, unknown>;
};

export type ErrorDashboardData = {
  range: ErrorRange;
  schemaReady: boolean;
  error: string | null;
  totalGroups: number | null;
  summary: {
    totalEvents: number | null;
    affectedUsers: number | null;
    fatalEvents: number | null;
    openGroups: number | null;
    topGroupId: string | null;
    topGroupTitle: string | null;
    topGroupEvents: number | null;
  };
  breakdowns: Record<"release" | "route" | "os", Array<{ value: string; count: number }>>;
  spikes: Array<{ groupId: string; title: string; lastHourEvents: number; baselineHourly: number; increasePercent: number | null }>;
  groups: ErrorGroupRecord[];
};

export type ErrorGroupDetailData = {
  group: ErrorGroupRecord | null;
  events: ErrorEventRecord[];
  eventTotal: number | null;
  schemaReady: boolean;
  error: string | null;
};

const rangeMilliseconds: Record<ErrorRange, number> = {
  "1h": 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export function parseErrorRange(value?: string): ErrorRange {
  return value === "1h" || value === "7d" || value === "30d" ? value : "24h";
}

function mapGroup(row: Record<string, unknown>): ErrorGroupRecord {
  return {
    id: String(row.id), fingerprint: String(row.fingerprint), source: String(row.source), title: String(row.title),
    errorType: row.error_type == null ? null : String(row.error_type),
    severity: row.severity as ErrorGroupRecord["severity"], status: row.status as ErrorGroupRecord["status"],
    firstSeenAt: String(row.first_seen_at), lastSeenAt: String(row.last_seen_at), eventCount: Number(row.event_count),
    affectedUserCount: row.affected_user_count == null ? null : Number(row.affected_user_count),
    latestRelease: row.latest_release == null ? null : String(row.latest_release),
    latestEnvironment: row.latest_environment == null ? null : String(row.latest_environment),
    latestOsName: row.latest_os_name == null ? null : String(row.latest_os_name),
    latestOsVersion: row.latest_os_version == null ? null : String(row.latest_os_version),
    latestDeviceModel: row.latest_device_model == null ? null : String(row.latest_device_model),
    latestRoute: row.latest_route == null ? null : String(row.latest_route),
    latestApiEndpoint: row.latest_api_endpoint == null ? null : String(row.latest_api_endpoint),
    latestHttpStatus: row.latest_http_status == null ? null : Number(row.latest_http_status),
    assigneeId: row.assignee_id == null ? null : String(row.assignee_id),
    resolutionNote: row.resolution_note == null ? null : String(row.resolution_note),
    resolvedAt: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

const groupSelect = "id,fingerprint,source,title,error_type,severity,status,first_seen_at,last_seen_at,event_count,affected_user_count,latest_release,latest_environment,latest_os_name,latest_os_version,latest_device_model,latest_route,latest_api_endpoint,latest_http_status,assignee_id,resolution_note,resolved_at";

export const getErrorDashboardData = cache(async (range: ErrorRange): Promise<ErrorDashboardData> => {
  const client = await getOperationsClient();
  const empty: ErrorDashboardData = {
    range, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다.", totalGroups: null,
    summary: { totalEvents: null, affectedUsers: null, fatalEvents: null, openGroups: null, topGroupId: null, topGroupTitle: null, topGroupEvents: null },
    breakdowns: { release: [], route: [], os: [] }, spikes: [], groups: [],
  };
  if (!client) return empty;

  const since = new Date(Date.now() - rangeMilliseconds[range]).toISOString();
  const [summaryResult, breakdownResult, spikesResult, groupsResult] = await Promise.all([
    client.rpc("get_admin_error_summary", { since_at: since }).maybeSingle(),
    client.rpc("get_admin_error_breakdown", { since_at: since }),
    client.rpc("get_admin_error_spikes"),
    client.from("error_groups").select(groupSelect, { count: "exact" }).gte("last_seen_at", since).order("last_seen_at", { ascending: false }).range(0, 199),
  ]);
  const firstError = summaryResult.error || breakdownResult.error || spikesResult.error || groupsResult.error;
  if (firstError) return {
    ...empty,
    schemaReady: !isOperationsSchemaMissing(firstError.code),
    error: isOperationsSchemaMissing(firstError.code)
      ? "오류 분석 스키마와 관리자 집계 RPC 적용이 필요합니다."
      : "오류 대시보드를 조회할 수 없습니다.",
  };

  const summary = summaryResult.data as Record<string, unknown> | null;
  const breakdowns: ErrorDashboardData["breakdowns"] = { release: [], route: [], os: [] };
  for (const row of (breakdownResult.data ?? []) as Array<Record<string, unknown>>) {
    const dimension = String(row.dimension) as keyof typeof breakdowns;
    if (dimension in breakdowns) breakdowns[dimension].push({ value: String(row.value), count: Number(row.event_count) });
  }
  return {
    range, schemaReady: true, error: null, totalGroups: groupsResult.count,
    summary: {
      totalEvents: summary ? Number(summary.total_events) : 0,
      affectedUsers: summary ? Number(summary.affected_users) : 0,
      fatalEvents: summary ? Number(summary.fatal_events) : 0,
      openGroups: summary ? Number(summary.open_groups) : 0,
      topGroupId: summary?.top_group_id == null ? null : String(summary.top_group_id),
      topGroupTitle: summary?.top_group_title == null ? null : String(summary.top_group_title),
      topGroupEvents: summary?.top_group_events == null ? null : Number(summary.top_group_events),
    },
    breakdowns,
    spikes: ((spikesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      groupId: String(row.group_id), title: String(row.title), lastHourEvents: Number(row.last_hour_events),
      baselineHourly: Number(row.baseline_hourly), increasePercent: row.increase_percent == null ? null : Number(row.increase_percent),
    })),
    groups: ((groupsResult.data ?? []) as Array<Record<string, unknown>>).map(mapGroup),
  };
});

export const getErrorGroupDetail = cache(async (groupId: string): Promise<ErrorGroupDetailData> => {
  const client = await getOperationsClient();
  if (!client) return { group: null, events: [], eventTotal: null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const [groupResult, eventsResult] = await Promise.all([
    client.from("error_groups").select(groupSelect).eq("id", groupId).maybeSingle(),
    client.from("error_events")
      .select("id,occurred_at,environment,release,error_type,os_name,os_version,device_model,route,api_endpoint,http_status,operation,message,stack_trace,user_id_hash,request_id,sanitized_context", { count: "exact" })
      .eq("group_id", groupId).order("occurred_at", { ascending: false }).range(0, 199),
  ]);
  const firstError = groupResult.error || eventsResult.error;
  if (firstError) return {
    group: null, events: [], eventTotal: null, schemaReady: !isOperationsSchemaMissing(firstError.code),
    error: isOperationsSchemaMissing(firstError.code) ? "오류 운영 스키마 적용이 필요합니다." : "오류 상세를 조회할 수 없습니다.",
  };
  return {
    group: groupResult.data ? mapGroup(groupResult.data as Record<string, unknown>) : null,
    events: ((eventsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id), occurredAt: String(row.occurred_at), environment: row.environment == null ? null : String(row.environment),
      release: row.release == null ? null : String(row.release), errorType: row.error_type == null ? null : String(row.error_type),
      osName: row.os_name == null ? null : String(row.os_name), osVersion: row.os_version == null ? null : String(row.os_version),
      deviceModel: row.device_model == null ? null : String(row.device_model), route: row.route == null ? null : String(row.route),
      apiEndpoint: row.api_endpoint == null ? null : String(row.api_endpoint), httpStatus: row.http_status == null ? null : Number(row.http_status),
      operation: row.operation == null ? null : String(row.operation), message: row.message == null ? null : String(row.message),
      stackTrace: row.stack_trace == null ? null : String(row.stack_trace), userIdHash: row.user_id_hash == null ? null : String(row.user_id_hash),
      requestId: row.request_id == null ? null : String(row.request_id),
      sanitizedContext: row.sanitized_context && typeof row.sanitized_context === "object" ? row.sanitized_context as Record<string, unknown> : {},
    })),
    eventTotal: eventsResult.count, schemaReady: true, error: null,
  };
});

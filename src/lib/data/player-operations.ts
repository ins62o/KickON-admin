import "server-only";

import { fetchAllRows, fetchRowsForIds } from "./pagination";
import { CURRENT_SEASON, leagueIds, type LeagueFilter, type LeagueId } from "@/lib/football/config";
import { cache } from "react";
import { getTeamName } from "./catalog";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type PlayerChangeRange = "24h" | "7d" | "30d";
export type PlayerChangeStatus = "detected" | "reviewing" | "applied" | "ignored";
export type PlayerChangeType =
  | "squad_added" | "transfer" | "loan_in" | "loan_out" | "loan_return"
  | "released" | "contract_expired" | "squad_removed"
  | "shirt_number_change" | "position_change" | "unknown";

export const playerChangeTypeLabels: Record<PlayerChangeType, string> = {
  squad_added: "선수단 추가",
  transfer: "완전 이적",
  loan_in: "임대 영입",
  loan_out: "임대 이적",
  loan_return: "임대 복귀",
  released: "방출",
  contract_expired: "계약 만료",
  squad_removed: "선수단 제외",
  shirt_number_change: "등번호 변경",
  position_change: "포지션 변경",
  unknown: "확인 필요",
};

export const playerChangeStatusLabels: Record<PlayerChangeStatus, string> = {
  detected: "확인 필요",
  reviewing: "검토 중",
  applied: "반영 완료",
  ignored: "무시",
};

export type PlayerChangeRecord = {
  id: string;
  playerId: string;
  playerName: string;
  fromTeamId: string | null;
  fromTeamName: string | null;
  toTeamId: string | null;
  toTeamName: string | null;
  changeType: PlayerChangeType;
  fieldPath: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  movementDate: string | null;
  detectedAt: string;
  source: string;
  sourceReference: string | null;
  dbReflected: boolean;
  reviewStatus: PlayerChangeStatus;
  reviewedBy: string | null;
  resolutionNote: string | null;
  reflectedAt: string | null;
};

export type ManualOverrideRecord = {
  id: string;
  entityId: string;
  fieldPath: string;
  originalValue: unknown;
  overrideValue: unknown;
  reason: string;
  blocksSync: boolean;
  createdBy: string;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RelatedReport = {
  id: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
};

export type RelatedAudit = {
  id: string;
  action: string;
  entityType: string;
  reason: string | null;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: string;
};

type ChangeFilters = {
  range: PlayerChangeRange;
  season?: number;
  leagueId?: LeagueFilter;
  teamId?: string;
  status?: PlayerChangeStatus;
  type?: PlayerChangeType;
};

const changeSelect = "id,player_id,player_name,from_team_id,to_team_id,change_type,field_path,before_value,after_value,movement_date,detected_at,source,source_reference,db_reflected,review_status,reviewed_by,resolution_note,reflected_at";

function sinceForRange(range: PlayerChangeRange) {
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export function parsePlayerChangeRange(value: string | undefined): PlayerChangeRange {
  return value === "24h" || value === "7d" ? value : "30d";
}

export function parsePlayerChangeStatus(value: string | undefined): PlayerChangeStatus | undefined {
  return value && value in playerChangeStatusLabels ? value as PlayerChangeStatus : undefined;
}

export function parsePlayerChangeType(value: string | undefined): PlayerChangeType | undefined {
  return value && value in playerChangeTypeLabels ? value as PlayerChangeType : undefined;
}

function mapChange(row: Record<string, unknown>): PlayerChangeRecord {
  const fromTeamId = row.from_team_id ? String(row.from_team_id) : null;
  const toTeamId = row.to_team_id ? String(row.to_team_id) : null;
  return {
    id: String(row.id),
    playerId: String(row.player_id),
    playerName: String(row.player_name),
    fromTeamId,
    fromTeamName: fromTeamId ? getTeamName(fromTeamId) : jsonString(row.before_value, "teamName"),
    toTeamId,
    toTeamName: toTeamId ? getTeamName(toTeamId) : jsonString(row.after_value, "teamName"),
    changeType: row.change_type as PlayerChangeType,
    fieldPath: row.field_path ? String(row.field_path) : null,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    movementDate: row.movement_date ? String(row.movement_date) : null,
    detectedAt: String(row.detected_at),
    source: String(row.source),
    sourceReference: row.source_reference ? String(row.source_reference) : null,
    dbReflected: Boolean(row.db_reflected),
    reviewStatus: row.review_status as PlayerChangeStatus,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    reflectedAt: row.reflected_at ? String(row.reflected_at) : null,
  };
}

function jsonString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export const getPlayerChanges = cache(async (filters: ChangeFilters) => {
  const client = await getOperationsClient();
  if (!client) return { rows: [] as PlayerChangeRecord[], total: null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };

  let query = client.from("player_change_events").select(changeSelect, { count: "exact" })
    .eq("season", filters.season ?? CURRENT_SEASON).in("league_id", leagueIds(filters.leagueId)).gte("detected_at", sinceForRange(filters.range)).order("detected_at", { ascending: false }).range(0, 499);
  if (filters.teamId && /^[a-z0-9-]{1,80}$/i.test(filters.teamId)) query = query.or(`from_team_id.eq.${filters.teamId},to_team_id.eq.${filters.teamId}`);
  if (filters.status) query = query.eq("review_status", filters.status);
  if (filters.type) query = query.eq("change_type", filters.type);
  const result = await query;
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { rows: [] as PlayerChangeRecord[], total: null, schemaReady: !missing, error: missing ? "선수 변동 감지 마이그레이션 적용이 필요합니다." : "선수 변동을 조회할 수 없습니다." };
  }
  return { rows: (result.data ?? []).map((row) => mapChange(row)), total: result.count, schemaReady: true, error: null };
});

export const getPlayerChangeDetail = cache(async (changeId: string) => {
  const client = await getOperationsClient();
  if (!client) return { change: null as PlayerChangeRecord | null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const result = await client.from("player_change_events").select(changeSelect).eq("id", changeId).maybeSingle();
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { change: null as PlayerChangeRecord | null, schemaReady: !missing, error: missing ? "선수 변동 감지 마이그레이션 적용이 필요합니다." : "선수 변동 상세를 조회할 수 없습니다." };
  }
  return { change: result.data ? mapChange(result.data) : null, schemaReady: true, error: null };
});

function mapOverride(row: Record<string, unknown>): ManualOverrideRecord {
  return {
    id: String(row.id), entityId: String(row.entity_id), fieldPath: String(row.field_path), originalValue: row.original_value,
    overrideValue: row.override_value, reason: String(row.reason), blocksSync: Boolean(row.blocks_sync),
    createdBy: String(row.created_by), releasedBy: row.released_by ? String(row.released_by) : null,
    releasedAt: row.released_at ? String(row.released_at) : null,
    releaseReason: row.release_reason ? String(row.release_reason) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export const getPlayerOperations = cache(async (playerId: string, season: number, leagueId: LeagueId) => {
  const client = await getOperationsClient();
  const empty = { overrides: [] as ManualOverrideRecord[], changes: [] as PlayerChangeRecord[], reports: [] as RelatedReport[], audits: [] as RelatedAudit[] };
  if (!client) return { ...empty, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const [overrides, changes, reports, audits] = await Promise.all([
    client.from("manual_overrides").select("id,entity_id,field_path,original_value,override_value,reason,blocks_sync,created_by,released_by,released_at,release_reason,created_at,updated_at").eq("entity_type", "player").eq("entity_id", playerId).eq("season", season).eq("league_id", leagueId).order("created_at", { ascending: false }).limit(50),
    client.from("player_change_events").select(changeSelect).eq("player_id", playerId).eq("season", season).eq("league_id", leagueId).order("detected_at", { ascending: false }).limit(50),
    client.from("user_data_reports").select("id,description,status,priority,created_at").eq("entity_type", "player").eq("entity_id", playerId).order("created_at", { ascending: false }).limit(50),
    client.from("admin_audit_logs").select("id,action,entity_type,reason,before_value,after_value,created_at").eq("entity_id", playerId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (overrides.error) {
    const missing = isOperationsSchemaMissing(overrides.error.code);
    return { ...empty, schemaReady: !missing, error: missing ? "선수 상세 수정 SQL 적용이 필요합니다." : "선수 수정 이력을 조회할 수 없습니다." };
  }
  return {
    overrides: (overrides.data ?? []).map((row) => mapOverride(row)),
    changes: changes.error ? [] : (changes.data ?? []).map((row) => mapChange(row)),
    reports: reports.error ? [] : (reports.data ?? []).map((row) => ({ id: row.id, description: row.description, status: row.status, priority: row.priority, createdAt: row.created_at })),
    audits: audits.error ? [] : (audits.data ?? []).map((row) => ({ id: String(row.id), action: row.action, entityType: row.entity_type, reason: row.reason, beforeValue: row.before_value, afterValue: row.after_value, createdAt: row.created_at })),
    schemaReady: true,
    error: null,
  };
});

export const getActivePlayerOverrideCounts = cache(async (league: LeagueFilter = "all", season = CURRENT_SEASON) => {
  const client = await getOperationsClient();
  if (!client) return new Map<string, number>();
  const result = await fetchAllRows((from, to) => client.from("manual_overrides").select("season,league_id,entity_id,field_path").eq("season", season).in("league_id", leagueIds(league)).eq("entity_type", "player").is("released_at", null).order("id").range(from, to));
  if (result.error) return new Map<string, number>();
  const counts = new Map<string, number>();
  for (const row of result.data ?? []) counts.set(`${row.season}:${row.league_id}:${row.entity_id}`, (counts.get(`${row.season}:${row.league_id}:${row.entity_id}`) ?? 0) + 1);
  return counts;
});

export const getClubPlayerOperations = cache(async (teamId: string, playerIds: string[], season: number, leagueId: LeagueId) => {
  const client = await getOperationsClient();
  const empty = { changes: [] as PlayerChangeRecord[], overrides: [] as ManualOverrideRecord[], reports: [] as RelatedReport[], audits: [] as RelatedAudit[] };
  if (!client) return { ...empty, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const safePlayerIds = [...new Set(playerIds)];
  const changesQuery = client.from("player_change_events").select(changeSelect).eq("season", season).eq("league_id", leagueId).or(`from_team_id.eq.${teamId},to_team_id.eq.${teamId}`).order("detected_at", { ascending: false }).limit(100);
  const overridesQuery = safePlayerIds.length > 0
    ? fetchRowsForIds(safePlayerIds, (ids, from, to) => client.from("manual_overrides").select("id,entity_id,field_path,original_value,override_value,reason,blocks_sync,created_by,released_by,released_at,release_reason,created_at,updated_at").eq("entity_type", "player").in("entity_id", ids).eq("season", season).eq("league_id", leagueId).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve({ data: [], error: null });
  const teamReports = client.from("user_data_reports").select("id,description,status,priority,created_at").eq("entity_type", "team").eq("entity_id", teamId).order("created_at", { ascending: false }).limit(50);
  const playerReports = safePlayerIds.length > 0
    ? fetchRowsForIds(safePlayerIds, (ids, from, to) => client.from("user_data_reports").select("id,description,status,priority,created_at").eq("entity_type", "player").in("entity_id", ids).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve({ data: [], error: null });
  const teamAudits = client.from("admin_audit_logs").select("id,action,entity_type,reason,before_value,after_value,created_at").eq("entity_id", teamId).order("created_at", { ascending: false }).limit(50);
  const playerAudits = safePlayerIds.length > 0
    ? fetchRowsForIds(safePlayerIds, (ids, from, to) => client.from("admin_audit_logs").select("id,action,entity_type,reason,before_value,after_value,created_at").in("entity_id", ids).order("created_at", { ascending: false }).order("id").range(from, to))
    : Promise.resolve({ data: [], error: null });
  const [changes, overrides, directReports, relatedReports, audits, relatedAudits] = await Promise.all([changesQuery, overridesQuery, teamReports, playerReports, teamAudits, playerAudits]);
  const error = changes.error ?? overrides.error ?? directReports.error ?? relatedReports.error ?? audits.error ?? relatedAudits.error;
  if (error) {
    const missing = isOperationsSchemaMissing(error.code);
    return { ...empty, schemaReady: !missing, error: missing ? "구단 운영 마이그레이션 적용이 필요합니다." : "구단 운영 데이터를 조회할 수 없습니다." };
  }
  const reportMap = new Map([...(directReports.data ?? []), ...(relatedReports.data ?? [])].map((row) => [row.id, row]));
  const auditMap = new Map([...(audits.data ?? []), ...(relatedAudits.data ?? [])].map((row) => [String(row.id), row]));
  return {
    changes: (changes.data ?? []).map((row) => mapChange(row)),
    overrides: (overrides.data ?? []).map((row) => mapOverride(row)),
    reports: [...reportMap.values()].map((row) => ({ id: row.id, description: row.description, status: row.status, priority: row.priority, createdAt: row.created_at })),
    audits: [...auditMap.values()].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).map((row) => ({ id: String(row.id), action: row.action, entityType: row.entity_type, reason: row.reason, beforeValue: row.before_value, afterValue: row.after_value, createdAt: row.created_at })),
    schemaReady: true,
    error: null,
  };
});

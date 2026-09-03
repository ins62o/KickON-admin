import "server-only";

import { cache } from "react";
import { getSyncOperation } from "@/lib/sync/catalog";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type AuditLogRecord = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
};

export function auditActionLabel(value: string) {
  return ({
    INSERT: "새로 추가", UPDATE: "수정", DELETE: "삭제", RETENTION_CLEANUP: "보관 기한 정리",
    SUPPORT_INQUIRY_UPDATE: "문의 처리", SUPPORT_INQUIRY_NOTE_ADD: "문의 메모 추가",
    USER_WARN: "사용자 경고", USER_SUSPEND: "사용자 정지", USER_UNSUSPEND: "사용자 정지 해제",
    CONTENT_REPORT_STATUS_UPDATE: "신고 상태 변경", CONTENT_HIDE: "콘텐츠 숨김", CONTENT_RESTORE: "콘텐츠 복원",
    PLAYER_VERIFIED_NAME_SET: "선수 검증명 변경", MANUAL_PLAYER_CREATED: "수동 선수 등록",
    MANUAL_PLAYER_UPDATED: "수동 선수 수정", MANUAL_PLAYER_MERGED: "수동 선수 병합",
    SYNC_RUN_EXECUTE: "동기화 실행",
  } as Record<string, string>)[value.toUpperCase()] ?? "기타 작업";
}

export function auditEntityLabel(value: string) {
  return ({
    admin_users: "관리자 권한",
    user_data_reports: "사용자 데이터 제보",
    error_groups: "앱 오류",
    manual_overrides: "직접 수정 보호값",
    player_change_events: "선수 변동",
    sync_runs: "데이터 동기화",
    football_provider_usage: "외부 축구 데이터 사용 기록",
    fixture_cheer_messages: "경기 응원 메시지",
    support_inquiry: "1:1 문의",
    content_report: "커뮤니티 신고",
    post: "게시글",
    comment: "댓글",
    fixture_cheer: "경기 응원",
    user: "사용자",
    football_player_localization: "선수 검증명",
    team_player: "선수단 선수",
    player: "선수",
    team: "구단",
    club: "구단",
    fixture: "경기",
    standing: "팀 순위",
    ranking: "개인 순위",
  } as Record<string, string>)[value.toLowerCase()] ?? "기타 운영 데이터";
}

export function auditFieldLabel(value: string) {
  return ({
    name: "이름",
    display_name: "표시 이름",
    image_url: "이미지",
    logo_url: "로고",
    team_id: "소속 구단",
    entity_type: "대상 종류",
    entity_id: "대상",
    field_path: "수정 항목",
    override_value: "직접 수정값",
    source_value: "외부 원본값",
    release_reason: "보호 해제 사유",
    released_at: "보호 해제 시각",
    released_by: "보호 해제 작업자",
    reason: "변경 사유",
    resolution_note: "처리 메모",
    status: "처리 상태",
    priority: "우선순위",
    assignee_id: "담당자",
    role: "관리자 권한",
    is_active: "계정 사용 여부",
    shirt_number: "등번호",
    position: "포지션",
    nationality: "국적",
    birth_date: "생년월일",
    score: "경기 점수",
    deletedCount: "정리한 기록 수",
    cutoffAt: "정리 기준 시각",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

export function auditRoleLabel(value: string | null) {
  if (!value) return "시스템 자동 작업";
  return ({
    viewer: "조회 담당자",
    operator: "운영 담당자",
    admin: "관리자",
    support: "고객 지원",
    moderator: "커뮤니티 운영",
    data_editor: "데이터 편집",
    super_admin: "최고 관리자",
  } as Record<string, string>)[value] ?? "운영 담당자";
}

const sensitiveKey = /token|secret|password|authorization|cookie|session|credential|refresh|access[_-]?key/i;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function safeObject(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED_DEPTH]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.replace(bearerPattern, "[REDACTED_BEARER]").replace(jwtPattern, "[REDACTED_JWT]").slice(0, 10000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeObject(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 150).map(([key, item]) => [key.slice(0, 120), sensitiveKey.test(key) ? "[REDACTED]" : safeObject(item, depth + 1)]));
  return String(value).slice(0, 1000);
}

function record(value: unknown) {
  const safe = safeObject(value);
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, unknown> : null;
}

function mapAuditRecord(row: Record<string, unknown>): AuditLogRecord {
  return {
    id: String(row.id),
    actorId: row.actor_id == null ? null : String(row.actor_id),
    actorRole: row.actor_role == null ? null : String(row.actor_role),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id == null ? null : String(row.entity_id),
    reason: row.reason == null ? null : String(row.reason),
    beforeValue: record(row.before_value),
    afterValue: record(row.after_value),
    requestId: row.request_id == null ? null : String(row.request_id),
    createdAt: String(row.created_at),
  };
}

export const getAuditLogList = cache(async () => {
  const client = await getOperationsClient();
  const empty = { logs: [] as AuditLogRecord[], total: null as number | null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." as string | null };
  if (!client) return empty;
  const result = await client
    .from("admin_audit_logs")
    .select("id,actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value,request_id,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, 199);
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { ...empty, schemaReady: !missing, error: missing ? "운영 변경 기록 스키마 적용이 필요합니다." : "관리자 변경 기록을 조회할 수 없습니다." };
  }
  return { logs: ((result.data ?? []) as Array<Record<string, unknown>>).map(mapAuditRecord), total: result.count, schemaReady: true, error: null };
});

export const getAuditLogDetail = cache(async (auditId: string) => {
  const client = await getOperationsClient();
  if (!client) return { data: null as AuditLogRecord | null, schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const result = await client.from("admin_audit_logs").select("id,actor_id,actor_role,action,entity_type,entity_id,reason,before_value,after_value,request_id,created_at").eq("id", auditId).maybeSingle();
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { data: null as AuditLogRecord | null, schemaReady: !missing, error: missing ? "운영 스키마 마이그레이션 적용이 필요합니다." : "운영 변경 상세를 조회할 수 없습니다." };
  }
  if (!result.data) return { data: null as AuditLogRecord | null, schemaReady: true, error: null };
  return { data: mapAuditRecord(result.data as Record<string, unknown>), schemaReady: true, error: null };
});

export function auditFieldDiff(beforeValue: Record<string, unknown> | null, afterValue: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(beforeValue ?? {}), ...Object.keys(afterValue ?? {})]);
  return [...keys].sort().map((field) => {
    const before = beforeValue?.[field];
    const after = afterValue?.[field];
    return { field, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  });
}

export function auditChangeSummary(log: AuditLogRecord) {
  if (log.action.toUpperCase() === "SYNC_RUN_EXECUTE") {
    const metadata = log.afterValue?.metadata;
    const operationKey = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      && typeof (metadata as Record<string, unknown>).operationKey === "string"
      ? String((metadata as Record<string, unknown>).operationKey)
      : null;
    const operationLabel = operationKey ? getSyncOperation(operationKey)?.label : null;
    return `${operationLabel ?? "데이터 동기화"} 실행`;
  }
  if (log.action.toUpperCase() === "RETENTION_CLEANUP") return "보관 기한이 지난 기록 정리";
  if (log.action.toUpperCase() === "INSERT") return `${auditEntityLabel(log.entityType)} 새 기록 추가`;
  if (log.action.toUpperCase() === "DELETE") return `${auditEntityLabel(log.entityType)} 기록 삭제`;
  const changed = auditFieldDiff(log.beforeValue, log.afterValue)
    .filter((field) => field.changed && !["updated_at", "created_at"].includes(field.field))
    .map((field) => auditFieldLabel(field.field));
  if (changed.length === 0) return `${auditEntityLabel(log.entityType)} 정보 수정`;
  const firstFields = changed.slice(0, 2).join(", ");
  return `${firstFields}${changed.length > 2 ? ` 외 ${changed.length - 2}개` : ""} 수정`;
}

export function auditEntityHref(log: AuditLogRecord) {
  const value = log.afterValue ?? log.beforeValue;
  const nestedType = typeof value?.entity_type === "string" ? value.entity_type : null;
  const nestedId = typeof value?.entity_id === "string" ? value.entity_id : log.entityId;
  if (log.entityType === "manual_overrides" && nestedType && nestedId) {
    if (nestedType === "player") return `/squads/${nestedId}`;
    if (nestedType === "fixture") return `/fixtures/${nestedId}`;
    if (nestedType === "standing") return `/standings/${nestedId}`;
  }
  if (!log.entityId) return null;
  if (log.entityType === "user_data_reports") return `/reports/${log.entityId}`;
  if (log.entityType === "error_groups") return `/errors/${log.entityId}`;
  if (log.entityType === "player_change_events") return `/transfers/${log.entityId}`;
  return null;
}

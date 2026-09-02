"use server";

import { revalidatePath } from "next/cache";
import { createAuthServerClient, requireAdmin, type AdminRole } from "@/lib/auth/server";
import type { PlayerChangeStatus, PlayerChangeType } from "@/lib/data/player-operations";
import type { ReportPriority, ReportStatus } from "@/lib/data/reports";

export type OperationActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  completedAt: string | null;
};

const roleRank: Record<AdminRole, number> = {
  viewer: 10,
  support: 10,
  operator: 20,
  moderator: 20,
  data_editor: 20,
  admin: 30,
  super_admin: 40,
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reportStatuses = new Set<ReportStatus>(["open", "in_review", "resolved", "rejected", "on_hold"]);
const reportPriorities = new Set<ReportPriority>(["low", "normal", "high", "urgent"]);
const errorStatuses = new Set(["open", "investigating", "resolved", "ignored"]);
const playerChangeStatuses = new Set<PlayerChangeStatus>(["detected", "reviewing", "applied", "ignored"]);
const playerChangeTypes = new Set<PlayerChangeType>([
  "squad_added", "transfer", "loan_in", "loan_out", "loan_return", "released",
  "contract_expired", "squad_removed", "shirt_number_change", "position_change", "unknown",
]);
const overrideFields = new Set(["display_name_ko", "shirt_number", "position", "detailed_position", "in_squad"]);
const fixtureOverrideFields = new Set(["kickoff_at", "status", "home_score", "away_score", "round"]);
const standingOverrideFields = new Set(["rank", "played", "won", "drawn", "lost", "goals_for", "goals_against", "goal_difference", "points", "clean_sheets", "average_possession"]);
const playerIdPattern = /^[a-z0-9_-]{1,80}$/i;
const entityIdPattern = /^[a-z0-9_-]{1,160}$/i;

async function getOperatorContext(requiredRole: AdminRole = "operator") {
  const admin = await requireAdmin();
  if (admin.isDevelopmentBypass || !admin.userId) return { error: "인증 우회 상태에서는 운영 데이터를 변경할 수 없습니다." } as const;
  if (roleRank[admin.role] < roleRank[requiredRole]) return { error: `${requiredRole === "admin" ? "관리자" : "운영자"} 이상의 권한이 필요합니다.` } as const;
  const supabase = await createAuthServerClient();
  if (!supabase) return { error: "운영 데이터 연결 설정이 없습니다." } as const;
  return { admin, supabase, error: null } as const;
}

export async function updateReportAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext();
  if (context.error) return { status: "error", message: context.error, completedAt: null };

  const reportId = String(formData.get("reportId") ?? "");
  const status = String(formData.get("status") ?? "") as ReportStatus;
  const priority = String(formData.get("priority") ?? "") as ReportPriority;
  const note = String(formData.get("note") ?? "").trim();
  if (!uuidPattern.test(reportId) || !reportStatuses.has(status) || !reportPriorities.has(priority)) {
    return { status: "error", message: "제보 처리 값이 올바르지 않습니다.", completedAt: null };
  }
  if (note.length < 3 || note.length > 2000) {
    return { status: "error", message: "처리 메모를 3자 이상 2,000자 이하로 입력해 주세요.", completedAt: null };
  }

  const isFinal = status === "resolved" || status === "rejected";
  const { data, error } = await context.supabase.from("user_data_reports").update({
    status,
    priority,
    assignee_id: status === "open" ? null : context.admin.userId,
    resolution_note: note,
    resolved_at: isFinal ? new Date().toISOString() : null,
  }).eq("id", reportId).select("id").maybeSingle();
  if (error) return { status: "error", message: "제보 상태를 변경하지 못했습니다.", completedAt: null };
  if (!data) return { status: "error", message: "처리할 제보를 찾을 수 없거나 변경 권한이 없습니다.", completedAt: null };

  const completedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/reports");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath("/audit");
  return { status: "success", message: "제보 처리 상태와 감사 기록을 갱신했습니다.", completedAt };
}

export async function updateErrorGroupAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext();
  if (context.error) return { status: "error", message: context.error, completedAt: null };

  const groupId = String(formData.get("groupId") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!uuidPattern.test(groupId) || !errorStatuses.has(status)) {
    return { status: "error", message: "오류 처리 값이 올바르지 않습니다.", completedAt: null };
  }
  if (note.length < 3 || note.length > 2000) {
    return { status: "error", message: "처리 메모를 3자 이상 2,000자 이하로 입력해 주세요.", completedAt: null };
  }

  const isFinal = status === "resolved" || status === "ignored";
  const { data, error } = await context.supabase.from("error_groups").update({
    status,
    assignee_id: status === "open" ? null : context.admin.userId,
    resolution_note: note,
    resolved_at: isFinal ? new Date().toISOString() : null,
  }).eq("id", groupId).select("id").maybeSingle();
  if (error) return { status: "error", message: "오류 그룹 상태를 변경하지 못했습니다.", completedAt: null };
  if (!data) return { status: "error", message: "처리할 오류 그룹을 찾을 수 없거나 변경 권한이 없습니다.", completedAt: null };

  const completedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/errors");
  revalidatePath(`/errors/${groupId}`);
  revalidatePath("/audit");
  return { status: "success", message: "오류 처리 상태와 감사 기록을 갱신했습니다.", completedAt };
}

export async function updatePlayerChangeAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext();
  if (context.error) return { status: "error", message: context.error, completedAt: null };

  const changeId = String(formData.get("changeId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const status = String(formData.get("status") ?? "") as PlayerChangeStatus;
  const changeType = String(formData.get("changeType") ?? "") as PlayerChangeType;
  const note = String(formData.get("note") ?? "").trim();
  if (!uuidPattern.test(changeId) || !playerIdPattern.test(playerId) || !playerChangeStatuses.has(status) || !playerChangeTypes.has(changeType)) {
    return { status: "error", message: "선수 변동 처리 값이 올바르지 않습니다.", completedAt: null };
  }
  if (note.length < 3 || note.length > 2000) {
    return { status: "error", message: "처리 메모를 3자 이상 2,000자 이하로 입력해 주세요.", completedAt: null };
  }

  const updateValues: Record<string, unknown> = {
    change_type: changeType,
    review_status: status,
    reviewed_by: context.admin.userId,
    resolution_note: note,
  };
  if (status === "applied") updateValues.reflected_at = new Date().toISOString();
  let updateQuery = context.supabase.from("player_change_events").update(updateValues).eq("id", changeId);
  if (status === "applied") updateQuery = updateQuery.eq("db_reflected", true);
  const { data, error } = await updateQuery.select("id").maybeSingle();
  if (error) return { status: "error", message: "선수 변동 상태를 변경하지 못했습니다.", completedAt: null };
  if (!data) return { status: "error", message: status === "applied" ? "앱 데이터에 아직 반영되지 않았습니다. 먼저 선수단 새로고침 또는 직접 수정을 실행해 주세요." : "처리할 선수 변동을 찾을 수 없거나 변경 권한이 없습니다.", completedAt: null };

  const completedAt = new Date().toISOString();
  revalidatePath("/");
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${changeId}`);
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/clubs");
  revalidatePath("/audit");
  return { status: "success", message: "선수 변동 검토 결과를 저장했습니다.", completedAt };
}

function parseOverrideValue(field: string, rawValue: string): { ok: true; value: string | number | boolean } | { ok: false; error: string } {
  const value = rawValue.trim();
  if (field === "shirt_number") {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 999 ? { ok: true, value: number } : { ok: false, error: "등번호는 0~999 사이 정수여야 합니다." };
  }
  if (field === "in_squad") {
    if (value !== "true" && value !== "false") return { ok: false, error: "선수단 포함 여부 값이 올바르지 않습니다." };
    return { ok: true, value: value === "true" };
  }
  if (!value || value.length > 160) return { ok: false, error: "수정값을 1자 이상 160자 이하로 입력해 주세요." };
  return { ok: true, value };
}

export async function applyPlayerOverrideAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext("admin");
  if (context.error) return { status: "error", message: context.error, completedAt: null };

  const playerId = String(formData.get("playerId") ?? "");
  const field = String(formData.get("field") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const parsed = parseOverrideValue(field, String(formData.get("value") ?? ""));
  if (!playerIdPattern.test(playerId) || !overrideFields.has(field) || !parsed.ok) {
    return { status: "error", message: !parsed.ok ? parsed.error : "수동 수정 값이 올바르지 않습니다.", completedAt: null };
  }
  if (reason.length < 3 || reason.length > 1000) {
    return { status: "error", message: "수정 이유를 3자 이상 1,000자 이하로 입력해 주세요.", completedAt: null };
  }

  const { data, error } = await context.supabase.rpc("apply_player_manual_override", {
    p_player_id: playerId,
    p_season: 2026,
    p_league_id: "kleague",
    p_field_path: field,
    p_override_value: parsed.value,
    p_reason: reason,
  });
  if (error || !data) return { status: "error", message: "수동 수정값을 적용하지 못했습니다.", completedAt: null };

  const completedAt = new Date().toISOString();
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/clubs");
  revalidatePath("/audit");
  return { status: "success", message: "수동 수정값을 적용하고 다음 동기화의 덮어쓰기를 잠갔습니다.", completedAt };
}

export async function releasePlayerOverrideAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext("admin");
  if (context.error) return { status: "error", message: context.error, completedAt: null };

  const overrideId = String(formData.get("overrideId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!uuidPattern.test(overrideId) || !playerIdPattern.test(playerId) || reason.length < 3 || reason.length > 1000) {
    return { status: "error", message: "해제 대상과 이유를 확인해 주세요.", completedAt: null };
  }
  const { data, error } = await context.supabase.rpc("release_player_manual_override", {
    p_override_id: overrideId,
    p_release_reason: reason,
  });
  if (error || data !== true) return { status: "error", message: "수동 수정 잠금을 해제하지 못했습니다.", completedAt: null };

  const completedAt = new Date().toISOString();
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/clubs");
  revalidatePath("/audit");
  return { status: "success", message: "수동 수정 잠금을 해제했습니다. 다음 동기화부터 외부 값을 따릅니다.", completedAt };
}

function parseFixtureOverrideValue(field: string, rawValue: string): { ok: true; value: string | number } | { ok: false; error: string } {
  const value = rawValue.trim();
  if (field === "status") return ["SCHEDULED", "LIVE", "FINISHED", "CANCELED"].includes(value) ? { ok: true, value } : { ok: false, error: "경기 상태 값이 올바르지 않습니다." };
  if (field === "kickoff_at") {
    const zonedValue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+09:00` : value;
    return !Number.isNaN(Date.parse(zonedValue)) ? { ok: true, value: new Date(zonedValue).toISOString() } : { ok: false, error: "경기 시각이 올바르지 않습니다." };
  }
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 999 ? { ok: true, value: number } : { ok: false, error: "점수와 라운드는 0~999 사이 정수여야 합니다." };
}

export async function applyFixtureOverrideAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext("admin");
  if (context.error) return { status: "error", message: context.error, completedAt: null };
  const fixtureId = String(formData.get("entityId") ?? "");
  const field = String(formData.get("field") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const parsed = parseFixtureOverrideValue(field, String(formData.get("value") ?? ""));
  if (!entityIdPattern.test(fixtureId) || !fixtureOverrideFields.has(field) || !parsed.ok) return { status: "error", message: parsed.ok ? "경기 수정 값이 올바르지 않습니다." : parsed.error, completedAt: null };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "수정 이유를 3자 이상 1,000자 이하로 입력해 주세요.", completedAt: null };
  const { data, error } = await context.supabase.rpc("apply_fixture_manual_override", { p_fixture_id: fixtureId, p_field_path: field, p_override_value: parsed.value, p_reason: reason });
  if (error || !data) return { status: "error", message: "경기 수동 수정값을 적용하지 못했습니다.", completedAt: null };
  const completedAt = new Date().toISOString();
  revalidatePath("/fixtures"); revalidatePath(`/fixtures/${fixtureId}`); revalidatePath("/clubs"); revalidatePath("/audit");
  return { status: "success", message: "경기 수정값을 적용하고 다음 동기화의 덮어쓰기를 잠갔습니다.", completedAt };
}

function parseStandingOverrideValue(field: string, rawValue: string): { ok: true; value: number } | { ok: false; error: string } {
  const value = Number(rawValue.trim());
  if (!Number.isFinite(value)) return { ok: false, error: "순위·기록 값은 숫자여야 합니다." };
  if (field !== "goal_difference" && value < 0) return { ok: false, error: "이 필드는 음수로 수정할 수 없습니다." };
  if (field === "average_possession") return value <= 100 ? { ok: true, value } : { ok: false, error: "평균 점유율은 0~100 사이여야 합니다." };
  return Number.isInteger(value) ? { ok: true, value } : { ok: false, error: "이 필드는 정수로 입력해 주세요." };
}

export async function applyStandingOverrideAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext("admin");
  if (context.error) return { status: "error", message: context.error, completedAt: null };
  const teamId = String(formData.get("entityId") ?? "");
  const field = String(formData.get("field") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const parsed = parseStandingOverrideValue(field, String(formData.get("value") ?? ""));
  if (!entityIdPattern.test(teamId) || !standingOverrideFields.has(field) || !parsed.ok) return { status: "error", message: parsed.ok ? "순위 수정 값이 올바르지 않습니다." : parsed.error, completedAt: null };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "수정 이유를 3자 이상 1,000자 이하로 입력해 주세요.", completedAt: null };
  const { data, error } = await context.supabase.rpc("apply_standing_manual_override", { p_team_id: teamId, p_season: 2026, p_league_id: "kleague", p_field_path: field, p_override_value: parsed.value, p_reason: reason });
  if (error || !data) return { status: "error", message: "순위 수동 수정값을 적용하지 못했습니다.", completedAt: null };
  const completedAt = new Date().toISOString();
  revalidatePath("/standings"); revalidatePath(`/standings/${teamId}`); revalidatePath(`/clubs/${teamId}`); revalidatePath("/audit");
  return { status: "success", message: "순위 수정값을 적용하고 다음 동기화의 덮어쓰기를 잠갔습니다.", completedAt };
}

export async function releaseEntityOverrideAction(_previous: OperationActionState, formData: FormData): Promise<OperationActionState> {
  const context = await getOperatorContext("admin");
  if (context.error) return { status: "error", message: context.error, completedAt: null };
  const overrideId = String(formData.get("overrideId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!uuidPattern.test(overrideId) || !entityIdPattern.test(entityId) || !["fixture", "standing"].includes(entityType) || reason.length < 3 || reason.length > 1000) return { status: "error", message: "해제 대상과 이유를 확인해 주세요.", completedAt: null };
  const { data, error } = await context.supabase.rpc("release_entity_manual_override", { p_override_id: overrideId, p_entity_type: entityType, p_release_reason: reason });
  if (error || data !== true) return { status: "error", message: "수동 수정 잠금을 해제하지 못했습니다.", completedAt: null };
  const completedAt = new Date().toISOString();
  revalidatePath(`/${entityType === "fixture" ? "fixtures" : "standings"}`);
  revalidatePath(`/${entityType === "fixture" ? "fixtures" : "standings"}/${entityId}`);
  revalidatePath("/clubs"); revalidatePath("/audit");
  return { status: "success", message: "수동 수정 잠금을 해제했습니다. 다음 동기화부터 외부 값을 따릅니다.", completedAt };
}

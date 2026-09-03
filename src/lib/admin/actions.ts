"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAuthServerClient, requireAdmin } from "@/lib/auth/server";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/permissions";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialAdminActionState: AdminActionState = { status: "idle", message: null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function trustedOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return true;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const allowed = new Set((process.env.ADMIN_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  if (host) allowed.add(`${protocol}://${host}`);
  return allowed.has(origin);
}

async function mutationContext(permission: AdminPermission) {
  if (!await trustedOrigin()) return { error: "허용되지 않은 요청 출처입니다." } as const;
  const admin = await requireAdmin();
  if (admin.isDevelopmentBypass || !admin.userId) return { error: "로컬 인증 우회 상태에서는 운영 데이터를 변경할 수 없습니다." } as const;
  if (!hasAdminPermission(admin.role, permission)) return { error: "이 작업을 수행할 관리자 권한이 없습니다." } as const;
  const supabase = await createAuthServerClient();
  if (!supabase) return { error: "Supabase 관리자 연결을 확인해 주세요." } as const;
  return { admin, supabase, error: null } as const;
}

function textValue(formData: FormData, key: string, maximum: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maximum + 1);
}

function safeFailure(message: string) {
  if (/permission|required|권한/i.test(message)) return "권한 또는 필수 입력값을 확인해 주세요.";
  if (/not.?found|찾/i.test(message)) return "대상을 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  return "변경을 저장하지 못했습니다. 입력값과 관리자 마이그레이션 상태를 확인해 주세요.";
}

export async function updateSupportInquiryAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("support.write");
  if (context.error) return { status: "error", message: context.error };
  const inquiryId = textValue(formData, "inquiryId", 36);
  const status = textValue(formData, "status", 20);
  const answer = textValue(formData, "answer", 4000);
  const note = textValue(formData, "note", 4000);
  const reason = textValue(formData, "reason", 1000);
  if (!uuidPattern.test(inquiryId) || !["RECEIVED", "IN_PROGRESS", "ANSWERED", "CLOSED"].includes(status)) return { status: "error", message: "문의 또는 처리 상태가 올바르지 않습니다." };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "변경 사유를 3자 이상 1,000자 이하로 입력해 주세요." };
  if (status === "ANSWERED" && answer.length === 0) return { status: "error", message: "답변 완료 상태에는 사용자 답변이 필요합니다." };
  if (answer.length > 4000 || note.length > 4000) return { status: "error", message: "답변과 메모는 각각 4,000자 이하로 입력해 주세요." };
  const result = await context.supabase.rpc("admin_update_support_inquiry", { p_inquiry_id: inquiryId, p_status: status, p_answer_content: answer || null, p_internal_note: note || null, p_reason: reason });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/"); revalidatePath("/inquiries"); revalidatePath(`/inquiries/${inquiryId}`); revalidatePath("/audit");
  return { status: "success", message: "문의 처리 내용과 감사 기록을 저장했습니다." };
}

export async function applyUserModerationAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("users.moderate");
  if (context.error) return { status: "error", message: context.error };
  const userId = textValue(formData, "userId", 36);
  const action = textValue(formData, "action", 20).toUpperCase();
  const reason = textValue(formData, "reason", 1000);
  const suspendedUntilInput = textValue(formData, "suspendedUntil", 80);
  const reportIdInput = textValue(formData, "reportId", 36);
  if (!uuidPattern.test(userId) || !["WARN", "SUSPEND", "UNSUSPEND"].includes(action)) return { status: "error", message: "사용자 또는 조치 유형이 올바르지 않습니다." };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "조치 사유를 3자 이상 1,000자 이하로 입력해 주세요." };
  let suspendedUntil: string | null = null;
  if (action === "SUSPEND") {
    const parsed = new Date(suspendedUntilInput);
    if (!suspendedUntilInput || !Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now() || parsed.getTime() > Date.now() + 365 * 86_400_000) return { status: "error", message: "정지 종료 시각은 지금부터 365일 이내로 선택해 주세요." };
    suspendedUntil = parsed.toISOString();
  }
  if (reportIdInput && !uuidPattern.test(reportIdInput)) return { status: "error", message: "연결할 신고 ID가 올바르지 않습니다." };
  const result = await context.supabase.rpc("admin_apply_user_action", { p_user_id: userId, p_action: action, p_reason: reason, p_suspended_until: suspendedUntil, p_content_report_id: reportIdInput || null });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/"); revalidatePath("/users"); revalidatePath(`/users/${userId}`); revalidatePath("/moderation"); revalidatePath("/audit");
  return { status: "success", message: action === "WARN" ? "사용자 경고를 기록했습니다." : action === "SUSPEND" ? "커뮤니티 활동을 일시 정지했습니다." : "커뮤니티 활동 정지를 해제했습니다." };
}

export async function updateContentReportAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("moderation.write");
  if (context.error) return { status: "error", message: context.error };
  const reportId = textValue(formData, "reportId", 36);
  const status = textValue(formData, "status", 20);
  const resolutionNote = textValue(formData, "resolutionNote", 2000);
  const reason = textValue(formData, "reason", 1000);
  if (!uuidPattern.test(reportId) || !["OPEN", "REVIEWED", "RESOLVED", "DISMISSED"].includes(status)) return { status: "error", message: "신고 또는 처리 상태가 올바르지 않습니다." };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "변경 사유를 3자 이상 1,000자 이하로 입력해 주세요." };
  if (["RESOLVED", "DISMISSED"].includes(status) && resolutionNote.length === 0) return { status: "error", message: "완료 또는 기각에는 처리 메모가 필요합니다." };
  const result = await context.supabase.rpc("admin_update_content_report", { p_report_id: reportId, p_status: status, p_resolution_note: resolutionNote || null, p_reason: reason });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/"); revalidatePath("/moderation"); revalidatePath(`/moderation/${reportId}`); revalidatePath("/audit");
  return { status: "success", message: "신고 처리 상태를 저장했습니다." };
}

export async function setContentVisibilityAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("moderation.write");
  if (context.error) return { status: "error", message: context.error };
  const targetType = textValue(formData, "targetType", 30);
  const targetId = textValue(formData, "targetId", 36);
  const reportId = textValue(formData, "reportId", 36);
  const reason = textValue(formData, "reason", 1000);
  const hidden = textValue(formData, "hidden", 8) === "true";
  if (!uuidPattern.test(targetId) || !uuidPattern.test(reportId) || !["POST", "COMMENT", "FIXTURE_CHEER"].includes(targetType)) return { status: "error", message: "신고 대상 정보가 올바르지 않습니다." };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "숨김·복원 사유를 3자 이상 1,000자 이하로 입력해 주세요." };
  const result = await context.supabase.rpc("admin_set_content_visibility", { p_target_type: targetType, p_target_id: targetId, p_hidden: hidden, p_reason: reason, p_content_report_id: reportId });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/"); revalidatePath("/moderation"); revalidatePath(`/moderation/${reportId}`); revalidatePath("/audit");
  return { status: "success", message: hidden ? "콘텐츠를 숨겼습니다. 모바일 조회에서도 제외됩니다." : "콘텐츠 노출을 복원했습니다." };
}

export async function createManualPlayerAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("data.write");
  if (context.error) return { status: "error", message: context.error };
  const teamId = textValue(formData, "teamId", 120);
  const playerName = textValue(formData, "playerName", 120);
  const displayNameKo = textValue(formData, "displayNameKo", 120);
  const positionInput = textValue(formData, "position", 80);
  const position = positionInput === "__none" ? "" : positionInput;
  const detailedPosition = textValue(formData, "detailedPosition", 80);
  const reason = textValue(formData, "reason", 1000);
  const shirtNumberInput = textValue(formData, "shirtNumber", 4);
  const shirtNumber = shirtNumberInput === "" ? null : Number(shirtNumberInput);
  if (!teamId || playerName.length < 1 || reason.length < 3 || reason.length > 1000) return { status: "error", message: "팀, 선수 이름과 3자 이상의 등록 사유를 입력해 주세요." };
  if (shirtNumber !== null && (!Number.isInteger(shirtNumber) || shirtNumber < 0 || shirtNumber > 999)) return { status: "error", message: "등번호는 0~999 정수로 입력해 주세요." };
  const result = await context.supabase.rpc("admin_create_manual_player", { p_team_id: teamId, p_player_name: playerName, p_reason: reason, p_display_name_ko: displayNameKo || null, p_shirt_number: shirtNumber, p_position: position || null, p_detailed_position: detailedPosition || null, p_season: 2026, p_league_id: "kleague" });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/"); revalidatePath("/squads"); revalidatePath("/audit");
  return { status: "success", message: "수동 선수를 등록하고 동기화 보호를 활성화했습니다." };
}

export async function setVerifiedPlayerNameAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("data.write");
  if (context.error) return { status: "error", message: context.error };
  const playerId = textValue(formData, "playerId", 120);
  const nameKo = textValue(formData, "nameKo", 120);
  const reason = textValue(formData, "reason", 1000);
  if (!playerId || !nameKo || reason.length < 3 || reason.length > 1000) return { status: "error", message: "검증할 한글 이름과 3자 이상의 변경 사유를 입력해 주세요." };
  const result = await context.supabase.rpc("admin_set_verified_player_name", { p_provider_player_id: playerId, p_name_ko: nameKo, p_reason: reason });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  revalidatePath("/squads"); revalidatePath(`/squads/${encodeURIComponent(playerId)}`); revalidatePath("/audit");
  return { status: "success", message: "검증된 한글 이름을 저장했습니다. 다음 동기화에서도 유지됩니다." };
}

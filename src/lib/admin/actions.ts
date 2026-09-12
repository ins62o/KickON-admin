"use client";

import { readFootballScope } from "@/lib/football/config";
import { getCurrentBrowserAdmin } from "@/lib/auth/client-session";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/permissions";
import { invalidateAdminData } from "@/lib/client-data";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { callAdminAction } from "@/lib/admin-api";
import {
  buildCommunityNoticeRpcArgs,
  communityNoticeErrorMessage,
} from "@/lib/admin/community-notice-contract";

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialAdminActionState: AdminActionState = { status: "idle", message: null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedSuspensionDays = new Set([1, 3, 7, 30, 90, 365]);

async function mutationContext(permission: AdminPermission) {
  const admin = await getCurrentBrowserAdmin();
  if (!admin) return { error: "관리자 세션을 다시 확인해 주세요." } as const;
  if (!hasAdminPermission(admin.role, permission)) return { error: "이 작업을 수행할 관리자 권한이 없습니다." } as const;
  const supabase = getBrowserSupabaseClient();
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

export async function createCommunityNoticeAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await mutationContext("moderation.write");
  if (context.error) return { status: "error", message: context.error };

  const validation = buildCommunityNoticeRpcArgs({
    board: textValue(formData, "board", 10) as "LEAGUE" | "TEAM",
    teamId: textValue(formData, "teamId", 120),
    title: textValue(formData, "title", 100),
    content: textValue(formData, "content", 10_000),
  });
  if (!validation.ok) return { status: "error", message: validation.message };

  const result = await context.supabase.rpc(
    "admin_create_community_notice",
    validation.args,
  );
  if (result.error) {
    return { status: "error", message: communityNoticeErrorMessage(result.error) };
  }

  invalidateAdminData();
  return { status: "success", message: "공지사항을 등록했습니다." };
}

export async function deleteCommunityNoticeAction(
  _state: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const context = await mutationContext("moderation.write");
  if (context.error) return { status: "error", message: context.error };

  const noticeId = textValue(formData, "noticeId", 36);
  if (!uuidPattern.test(noticeId)) {
    return { status: "error", message: "공지사항 정보가 올바르지 않습니다." };
  }

  const result = await context.supabase.rpc("admin_delete_community_notice", {
    p_notice_id: noticeId,
  });
  if (result.error) {
    return { status: "error", message: communityNoticeErrorMessage(result.error) };
  }

  invalidateAdminData();
  return { status: "success", message: "공지사항을 삭제했습니다." };
}

export async function updateSupportInquiryAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("support.write");
  if (context.error) return { status: "error", message: context.error };
  const inquiryId = textValue(formData, "inquiryId", 36);
  const answer = textValue(formData, "answer", 4000);
  if (!uuidPattern.test(inquiryId)) return { status: "error", message: "문의 정보가 올바르지 않습니다." };
  if (answer.length === 0) return { status: "error", message: "사용자 답변을 입력해 주세요." };
  if (answer.length > 4000) return { status: "error", message: "답변은 4,000자 이하로 입력해 주세요." };
  const result = await context.supabase.rpc("admin_update_support_inquiry", { p_inquiry_id: inquiryId, p_status: "ANSWERED", p_answer_content: answer, p_internal_note: null, p_reason: "사용자 문의 답변 등록" });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  invalidateAdminData();
  return { status: "success", message: "답변을 저장하고 처리 상태를 답변 완료로 변경했습니다." };
}

export async function applyUserModerationAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const context = await mutationContext("users.moderate");
  if (context.error) return { status: "error", message: context.error };
  const userId = textValue(formData, "userId", 36);
  const action = textValue(formData, "action", 20).toUpperCase();
  const reason = textValue(formData, "reason", 1000);
  const suspensionDays = Number(textValue(formData, "suspensionDays", 3));
  const reportIdInput = textValue(formData, "reportId", 36);
  if (!uuidPattern.test(userId) || !["SUSPEND", "UNSUSPEND", "ACCOUNT_SUSPEND", "ACCOUNT_UNSUSPEND"].includes(action)) return { status: "error", message: "사용자 또는 조치 유형이 올바르지 않습니다." };
  if (reason.length < 3 || reason.length > 1000) return { status: "error", message: "조치 사유를 3자 이상 1,000자 이하로 입력해 주세요." };
  let suspendedUntil: string | null = null;
  if (["SUSPEND", "ACCOUNT_SUSPEND"].includes(action)) {
    if (!Number.isInteger(suspensionDays) || !allowedSuspensionDays.has(suspensionDays)) return { status: "error", message: "정지 기간을 선택해 주세요." };
    suspendedUntil = new Date(Date.now() + suspensionDays * 86_400_000).toISOString();
  }
  if (reportIdInput && !uuidPattern.test(reportIdInput)) return { status: "error", message: "연결할 신고 ID가 올바르지 않습니다." };
  if (["ACCOUNT_SUSPEND", "ACCOUNT_UNSUSPEND"].includes(action)) {
    try {
      const result = await callAdminAction<AdminActionState>("applyUserAccountAction", formData);
      if (result.status === "success") invalidateAdminData();
      return result;
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "계정 정지 상태를 저장하지 못했습니다.",
      };
    }
  }
  const result = await context.supabase.rpc("admin_apply_user_action", { p_user_id: userId, p_action: action, p_reason: reason, p_suspended_until: suspendedUntil, p_content_report_id: reportIdInput || null });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  invalidateAdminData();
  return { status: "success", message: action === "SUSPEND" ? "커뮤니티 활동을 일시 정지했습니다." : "커뮤니티 활동 정지를 해제했습니다." };
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
  invalidateAdminData();
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
  invalidateAdminData();
  return { status: "success", message: hidden ? "콘텐츠를 숨겼습니다. 모바일 조회에서도 제외됩니다." : "콘텐츠 노출을 복원했습니다." };
}

export async function createManualPlayerAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const scope = readFootballScope(formData);
  if (!scope) return { status: "error", message: "시즌과 리그를 확인해 주세요." };
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
  const result = await context.supabase.rpc("admin_create_manual_player", { p_team_id: teamId, p_player_name: playerName, p_reason: reason, p_display_name_ko: displayNameKo || null, p_shirt_number: shirtNumber, p_position: position || null, p_detailed_position: detailedPosition || null, p_season: scope.season, p_league_id: scope.leagueId });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  invalidateAdminData();
  return { status: "success", message: "수동 선수를 등록하고 동기화 보호를 활성화했습니다." };
}

export async function setVerifiedPlayerNameAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const scope = readFootballScope(formData);
  if (!scope) return { status: "error", message: "시즌과 리그를 확인해 주세요." };
  const context = await mutationContext("data.write");
  if (context.error) return { status: "error", message: context.error };
  const playerId = textValue(formData, "playerId", 120);
  const nameKo = textValue(formData, "nameKo", 120);
  const reason = textValue(formData, "reason", 1000);
  if (!playerId || !nameKo || reason.length < 3 || reason.length > 1000) return { status: "error", message: "검증할 한글 이름과 3자 이상의 변경 사유를 입력해 주세요." };
  const result = await context.supabase.rpc("admin_set_verified_player_name", { p_provider_player_id: playerId, p_season: scope.season, p_league_id: scope.leagueId, p_name_ko: nameKo, p_reason: reason });
  if (result.error) return { status: "error", message: safeFailure(result.error.message) };
  invalidateAdminData();
  return { status: "success", message: "검증된 한글 이름을 저장했습니다. 다음 동기화에서도 유지됩니다." };
}

export async function mergeManualPlayerAction(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const scope = readFootballScope(formData);
  const context = await mutationContext("data.write");
  if (context.error) return { status: "error", message: context.error };
  const manualId = textValue(formData, "manualPlayerId", 120);
  const providerId = textValue(formData, "providerPlayerId", 120);
  const reason = textValue(formData, "reason", 1000);
  if (!scope || !manualId.startsWith("manual_") || !providerId || providerId.startsWith("manual_") || reason.length < 3) return { status: "error", message: "리그·시즌·병합 대상과 사유를 확인해 주세요." };
  const result = await context.supabase.rpc("admin_merge_manual_player", { p_manual_player_id: manualId, p_provider_player_id: providerId, p_season: scope.season, p_league_id: scope.leagueId, p_reason: reason });
  if (result.error || result.data !== true) return { status: "error", message: "선수를 병합하지 못했습니다. 리그와 검증 한글명을 확인해 주세요." };
  invalidateAdminData();
  return { status: "success", message: "수동 선수를 같은 리그의 공급자 선수에 병합했습니다." };
}

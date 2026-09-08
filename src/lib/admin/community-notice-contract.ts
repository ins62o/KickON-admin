export type CommunityNoticeBoard = "LEAGUE" | "TEAM";

export type CommunityNoticeDraft = {
  board: CommunityNoticeBoard;
  teamId: string;
  title: string;
  content: string;
};

export type CommunityNoticeRpcArgs = {
  target_board: CommunityNoticeBoard;
  target_team_id: string;
  notice_title: string;
  notice_content: string;
};

export type CommunityNoticeValidation =
  | { ok: true; args: CommunityNoticeRpcArgs }
  | { ok: false; message: string };

export function buildCommunityNoticeRpcArgs(draft: CommunityNoticeDraft): CommunityNoticeValidation {
  const title = draft.title.trim();
  const content = draft.content.trim();
  const teamId = draft.teamId.trim();

  if (draft.board !== "LEAGUE" && draft.board !== "TEAM") {
    return { ok: false, message: "공지 노출 범위를 다시 선택해 주세요." };
  }
  if (title.length < 2 || title.length > 100) {
    return { ok: false, message: "제목을 2자 이상 100자 이하로 입력해 주세요." };
  }
  if (content.length < 5 || content.length > 10_000) {
    return { ok: false, message: "내용을 5자 이상 10,000자 이하로 입력해 주세요." };
  }
  if (draft.board === "TEAM" && !teamId) {
    return { ok: false, message: "팀별 게시판 공지는 대상 팀을 선택해 주세요." };
  }

  return {
    ok: true,
    args: {
      target_board: draft.board,
      target_team_id: draft.board === "TEAM" ? teamId : "",
      notice_title: title,
      notice_content: content,
    },
  };
}

export function communityNoticeErrorMessage(error: { code?: string; message?: string }) {
  const source = `${error.code ?? ""} ${error.message ?? ""}`;
  if (/ADMIN_PERMISSION_REQUIRED|MODERATION_PERMISSION_REQUIRED/i.test(source)) {
    return "공지사항을 관리할 권한이 없습니다.";
  }
  if (/INVALID_NOTICE_BOARD/i.test(source)) {
    return "공지 노출 범위가 올바르지 않습니다.";
  }
  if (/VALID_NOTICE_TEAM_REQUIRED/i.test(source)) {
    return "유효한 대상 팀을 선택해 주세요.";
  }
  if (/NOTICE_NOT_FOUND|MODERATION_TARGET_NOT_FOUND/i.test(source)) {
    return "공지사항을 찾을 수 없습니다. 목록을 새로고침해 주세요.";
  }
  if (/MODERATION_STATE_UNCHANGED/i.test(source)) {
    return "이미 같은 노출 상태로 설정되어 있습니다.";
  }
  if (/MODERATION_REASON_REQUIRED/i.test(source)) {
    return "게시 상태 변경 사유를 3자 이상 입력해 주세요.";
  }
  if (/PGRST202|Could not find the function|schema cache/i.test(source)) {
    return "공지사항 관리자 RPC가 아직 적용되지 않았습니다. Supabase 마이그레이션 상태를 확인해 주세요.";
  }
  return "공지사항을 저장하지 못했습니다. 입력값과 Supabase 연결 상태를 확인해 주세요.";
}

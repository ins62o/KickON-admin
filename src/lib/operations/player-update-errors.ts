type PlayerUpdateError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const playerUpdateMessages: Record<string, string> = {
  PLAYER_EDITOR_REQUIRED: "DB에서 선수 수정 권한을 확인하지 못했습니다. 관리자 계정의 역할과 활성 상태를 확인해 주세요.",
  INVALID_PLAYER_UPDATE: "선수 수정 요청 값이 올바르지 않습니다.",
  UNSUPPORTED_PLAYER_FIELD: "현재 수정할 수 없는 선수 정보가 포함되어 있습니다.",
  INVALID_PLAYER_TEAM: "선택한 소속 구단을 DB에서 찾을 수 없습니다.",
  INVALID_PLAYER_NAME: "선수 이름 값이 올바르지 않습니다.",
  INVALID_PLAYER_KOREAN_NAME: "선수 한국 이름 값이 올바르지 않습니다.",
  INVALID_SHIRT_NUMBER: "등번호 값이 올바르지 않습니다.",
  INVALID_PLAYER_TEXT_FIELD: "포지션 값이 올바르지 않습니다.",
  INVALID_PLAYER_STAT: "출전·득점·도움 값이 올바르지 않습니다.",
  INVALID_PLAYER_HEIGHT: "신장 값이 올바르지 않습니다.",
  INVALID_PLAYER_WEIGHT: "체중 값이 올바르지 않습니다.",
  INVALID_PLAYER_BIRTH_DATE: "생년월일 값이 올바르지 않습니다.",
  PLAYER_NOT_FOUND: "수정할 선수를 DB에서 찾을 수 없습니다. 선수단을 새로고침한 뒤 다시 시도해 주세요.",
};

export function getPlayerUpdateErrorMessage(error: PlayerUpdateError, schemaMissing: boolean) {
  if (schemaMissing) return "선수 상세 수정 SQL을 먼저 적용해 주세요.";

  const databaseMessage = error.message ?? "";
  const knownError = Object.entries(playerUpdateMessages).find(([key]) => databaseMessage.includes(key));
  if (knownError) return knownError[1];

  if (error.code === "42501") {
    return "선수 수정 RPC 실행 권한이 없습니다. player_detail_editing.sql의 권한 설정을 다시 적용해 주세요.";
  }
  if (error.code === "42804") {
    return "감사 로그 DB 자료형이 맞지 않습니다. admin_audit_logging.sql을 다시 적용해 주세요.";
  }
  if (error.code === "23503") return "선수 또는 소속 구단의 연결 정보가 올바르지 않습니다.";
  if (error.code === "23505") return "이미 같은 선수 수정 정보가 등록되어 충돌했습니다.";

  const reference = error.code ? ` (오류 코드: ${error.code})` : "";
  return `선수 정보를 수정하지 못했습니다.${reference}`;
}

export function formatPlayerUpdateErrorLog(playerId: string, error: PlayerUpdateError) {
  return [
    `[player-details:update] failed`,
    `playerId=${playerId}`,
    `code=${error.code ?? "UNKNOWN"}`,
    `message=${error.message ?? "UNKNOWN"}`,
    `details=${error.details ?? "NONE"}`,
    `hint=${error.hint ?? "NONE"}`,
  ].join(" ");
}

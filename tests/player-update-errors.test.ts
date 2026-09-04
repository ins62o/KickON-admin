import assert from "node:assert/strict";
import test from "node:test";
import { formatPlayerUpdateErrorLog, getPlayerUpdateErrorMessage } from "../src/lib/operations/player-update-errors.ts";

test("선수 수정 DB 오류를 운영자가 이해할 수 있는 메시지로 변환한다", () => {
  assert.equal(
    getPlayerUpdateErrorMessage({ code: "P0001", message: "PLAYER_EDITOR_REQUIRED" }, false),
    "DB에서 선수 수정 권한을 확인하지 못했습니다. 관리자 계정의 역할과 활성 상태를 확인해 주세요.",
  );
  assert.equal(
    getPlayerUpdateErrorMessage({ code: "42501", message: "permission denied" }, false),
    "선수 수정 RPC 실행 권한이 없습니다. player_detail_editing.sql의 권한 설정을 다시 적용해 주세요.",
  );
  assert.equal(
    getPlayerUpdateErrorMessage({ code: "PGRST202", message: "not found" }, true),
    "선수 상세 수정 SQL을 먼저 적용해 주세요.",
  );
  assert.equal(
    getPlayerUpdateErrorMessage({ code: "42804", message: "column type mismatch" }, false),
    "감사 로그 DB 자료형이 맞지 않습니다. admin_audit_logging.sql을 다시 적용해 주세요.",
  );
  assert.equal(
    getPlayerUpdateErrorMessage({ code: "XX000", message: "internal details" }, false),
    "선수 정보를 수정하지 못했습니다. (오류 코드: XX000)",
  );
});

test("선수 수정 실패 로그를 손실되지 않는 문자열로 만든다", () => {
  assert.equal(
    formatPlayerUpdateErrorLog("player_1", { code: "P0001", message: "PLAYER_NOT_FOUND", details: "context", hint: "retry" }),
    "[player-details:update] failed playerId=player_1 code=P0001 message=PLAYER_NOT_FOUND details=context hint=retry",
  );
});

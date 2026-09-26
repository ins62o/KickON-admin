import assert from "node:assert/strict";
import test from "node:test";

import { isCurrentTeamSquadKey, syncOperationFromStateKey } from "../src/lib/sync/catalog.ts";

test("현재 형식의 구단 선수단 키를 인식한다", () => {
  assert.equal(syncOperationFromStateKey("team-squad:2026:kleague:ulsan"), "team-squad");
  assert.equal(syncOperationFromStateKey("team-squad:2026:kleague2:chungbuk-cheongju"), "team-squad");
  assert.equal(isCurrentTeamSquadKey("team-squad:2026:kleague:ulsan"), true);
});

test("예전 형식의 구단 선수단 키도 계속 인식한다", () => {
  assert.equal(syncOperationFromStateKey("team-squad-2026-ulsan"), "team-squad");
  assert.equal(syncOperationFromStateKey("team-squad-2026-ulsan:2026:kleague"), "team-squad");
});

test("다른 시즌이나 다른 작업의 키는 구단 선수단으로 보지 않는다", () => {
  assert.equal(syncOperationFromStateKey("team-squad:2025:kleague:ulsan"), null);
  assert.equal(isCurrentTeamSquadKey("team-squad:2026:kleague"), false);
  assert.equal(syncOperationFromStateKey("sportmonks-live"), "live");
  assert.equal(syncOperationFromStateKey("sportmonks-history:2026:kleague"), null);
});

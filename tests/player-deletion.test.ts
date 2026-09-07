import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationName = "202609070001_admin_delete_player.sql";
const migration = readFileSync(new URL(migrationName, migrationsDirectory), "utf8");
const operations = readFileSync(new URL("../src/lib/data/operations.ts", import.meta.url), "utf8");

test("선수 삭제 RPC는 권한·감사 기록·동기화 차단을 함께 적용한다", () => {
  const migrationNames = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.ok(migrationNames.indexOf(migrationName) > migrationNames.indexOf("202609050008_admin_data_center.sql"));
  assert.match(migration, /admin_has_capability\('football\.write'\)/);
  assert.match(migration, /'in_squad',[\s\S]*'false'::jsonb,[\s\S]*normalized_reason, true, current_actor/);
  assert.match(migration, /set in_squad = false/);
  assert.match(migration, /'PLAYER_DELETED'/);
  assert.match(migration, /grant execute on function public\.admin_delete_player\(text, integer, text, text\)[\s\S]*to authenticated/);
});

test("활성 선수 조회 화면은 삭제된 선수를 제외한다", () => {
  const activePlayerFilters = operations.match(/\.eq\("in_squad", true\)/g) ?? [];
  assert.equal(activePlayerFilters.length, 3);
});

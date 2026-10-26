import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const migrationName = "202609050013_admin_usage_metrics.sql";
const migrationPath = new URL(migrationName, migrationsDirectory);
const source = readFileSync(migrationPath, "utf8");

function functionBlock(functionName: string) {
  const declaration = `create or replace function public.${functionName}()`;
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${functionName} declaration is missing`);

  const comment = `comment on function public.${functionName}()`;
  const end = source.indexOf(comment, start);
  assert.notEqual(end, -1, `${functionName} comment is missing`);
  return source.slice(start, end);
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

test("사용량 마이그레이션은 관리자 capability 정의 뒤에 적용된다", () => {
  const migrationNames = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  assert.equal(
    existsSync(new URL("202609040002_admin_usage_snapshot.sql", migrationsDirectory)),
    false,
    "dependency보다 먼저 실행되는 legacy usage migration must be removed",
  );
  assert.ok(migrationNames.includes("202609050008_admin_data_center.sql"));
  assert.ok(migrationNames.includes("202609050012_exclude_admin_accounts_from_user_metrics.sql"));
  assert.ok(migrationNames.includes(migrationName));
  assert.ok(
    migrationNames.indexOf(migrationName)
      > migrationNames.indexOf("202609050012_exclude_admin_accounts_from_user_metrics.sql"),
  );
});

test("aggregate RPC는 기존 합계 계약과 한국 시간 월간 합계를 반환한다", () => {
  const block = functionBlock("admin_get_usage_snapshot");
  const normalized = compact(block);

  assert.match(normalized, /returns table \( database_size_bytes bigint, storage_used_bytes bigint, storage_bucket_count bigint, storage_object_count bigint, storage_unmeasured_object_count bigint, storage_current_month_object_count bigint, storage_current_month_used_bytes bigint \)/);
  assert.match(block, /pg_database_size\(current_database\(\)\)::bigint/);
  assert.match(block, /from storage\.buckets bucket\s+left join storage\.objects stored_object/);
  assert.match(block, /stored_object\.metadata ->> 'size'/);
  assert.match(block, /count\(distinct bucket\.id\)::bigint/);
  assert.match(block, /count\(stored_object\.id\)::bigint as storage_object_count/);
  assert.match(block, /timezone\('Asia\/Seoul', now\(\)\)/);
  assert.match(block, /stored_object\.created_at >= v_month_start/);
  assert.match(block, /stored_object\.created_at < v_month_end/);
});

test("두 사용량 RPC는 system.read 또는 service_role만 허용한다", () => {
  for (const functionName of ["admin_get_usage_snapshot", "admin_get_storage_usage"]) {
    const block = functionBlock(functionName);
    assert.match(block, /security definer\s+set search_path = ''/);
    assert.match(block, /auth\.role\(\)[\s\S]*<> 'service_role'/);
    assert.match(block, /admin_has_capability\('system\.read'\)/);
    assert.doesNotMatch(block, /is_admin\(/);
    assert.doesNotMatch(block, /admin_has_capability\('storage\.read'\)/);
    assert.match(block, /raise exception 'SYSTEM_READER_REQUIRED'/);
    assert.match(block, /revoke all on function public\.[a-z_]+\(\)\s+from public, anon/);
    assert.match(block, /grant execute on function public\.[a-z_]+\(\)\s+to authenticated, service_role/);
  }
});

test("bucket RPC의 기존 결과 계약과 aggregate-only 경계를 유지한다", () => {
  const block = functionBlock("admin_get_storage_usage");
  const normalized = compact(block);

  assert.match(normalized, /returns table \( bucket_id text, object_count bigint, used_bytes numeric, unmeasured_object_count bigint, oldest_object_at timestamptz, newest_object_at timestamptz \)/);
  assert.match(block, /group by bucket\.id\s+order by bucket\.id/);
  assert.doesNotMatch(block, /stored_object\.name/);
});

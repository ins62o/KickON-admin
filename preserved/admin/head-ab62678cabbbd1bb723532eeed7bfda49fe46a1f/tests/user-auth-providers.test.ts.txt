import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadUserAuthProviders } from "../src/lib/admin/user-auth-providers.ts";

function rpcClient(rows: Array<{ user_id: string; auth_provider: string | null }>, errorOffset?: number) {
  return createClient("https://supabase.example", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, "/rest/v1/rpc/admin_get_user_auth_providers");
        assert.equal(url.searchParams.get("order"), "user_id.asc");
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 1_000), 1_000);
        if (errorOffset !== undefined && offset >= errorOffset) {
          return new Response(JSON.stringify({ code: "P0001", message: "Query failed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
}

test("로그인 제공자는 DB의 1,000행 제한을 넘는 사용자도 조회한다", async () => {
  const rows = Array.from({ length: 1_005 }, (_, index) => ({
    user_id: `user-${String(index).padStart(4, "0")}`,
    auth_provider: index % 2 === 0 ? "kakao" : "apple",
  }));

  const providers = await loadUserAuthProviders(rpcClient(rows));
  assert.equal(providers.size, 1_005);
  assert.equal(providers.get("user-1003"), "apple");
  assert.equal(providers.get("user-1004"), "kakao");
});

test("제공자가 없는 행이 있어도 뒤 페이지의 사용자를 조회한다", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    user_id: `user-${String(index).padStart(4, "0")}`,
    auth_provider: index === 0 ? null : "apple",
  }));

  const providers = await loadUserAuthProviders(rpcClient(rows));
  assert.equal(providers.size, 500);
  assert.equal(providers.has("user-0000"), false);
  assert.equal(providers.get("user-0500"), "apple");
});

test("뒤 페이지 조회가 실패하면 일부 사용자만 담긴 결과를 반환하지 않는다", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({
    user_id: `user-${String(index).padStart(4, "0")}`,
    auth_provider: "kakao",
  }));

  const providers = await loadUserAuthProviders(rpcClient(rows, 500));
  assert.equal(providers.size, 0);
});

test("로그인 제공자 조회 결과가 없으면 빈 결과를 반환한다", async () => {
  const providers = await loadUserAuthProviders(rpcClient([]));
  assert.equal(providers.size, 0);
});

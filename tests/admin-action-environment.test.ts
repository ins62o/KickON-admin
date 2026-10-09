import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function actionFixture(accountAction = false) {
  let active = "production";
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const writes: string[] = [];
  const calls: string[] = [];
  const boundary = {
    getActive: () => active,
    admin: async (environment: string = active) => {
      calls.push(environment);
      await pending;
      return { userId: "synthetic-user", role: "super_admin" };
    },
    client: (environment: string = active) => {
      if (accountAction) active = "development";
      return { rpc: async () => {
      writes.push(environment);
      return { error: null };
    } }; },
    api: async (_action: string, _form: FormData, _timeout: number, environment: string = active) => { writes.push(environment); return { status: "success" }; },
  };
  const code = (await build({
    entryPoints: ["src/lib/admin/actions.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "synthetic-action-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(auth\/client-session|supabase\/browser|environment|client-data|admin-api)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents:
        args.path.endsWith("client-session") ? "export const getCurrentBrowserAdmin = globalThis.__actionBoundary.admin;" :
        args.path.endsWith("supabase/browser") ? "export const getBrowserSupabaseClient = globalThis.__actionBoundary.client;" :
        args.path.endsWith("environment") ? "export const getActiveConsoleEnvironment = globalThis.__actionBoundary.getActive;" :
        args.path.endsWith("client-data") ? "export function invalidateAdminData(){}" :
        "export const callAdminAction = globalThis.__actionBoundary.api;", loader: "js" }));
    } }],
  })).outputFiles[0].text;
  const old = Object.getOwnPropertyDescriptor(globalThis, "__actionBoundary");
  Object.defineProperty(globalThis, "__actionBoundary", { configurable: true, value: boundary });
  const compiledModule = { exports: {} };
  try { new Function("module", "exports", code)(compiledModule, compiledModule.exports); }
  finally { if (old) Object.defineProperty(globalThis, "__actionBoundary", old); else Reflect.deleteProperty(globalThis, "__actionBoundary"); }
  const actions = compiledModule.exports as Record<string, (state: unknown, form: FormData) => Promise<{status: string}>>;
  const form = new FormData(); form.set("board", "LEAGUE"); form.set("title", "Synthetic notice"); form.set("content", "Synthetic content");
  if (accountAction) { form.set("userId", "00000000-0000-4000-8000-000000000001"); form.set("action", "ACCOUNT_SUSPEND"); form.set("suspensionDays", "1"); }
  return { run: () => actions[accountAction ? "applyUserModerationAction" : "createCommunityNoticeAction"]({}, form), switchEnvironment: () => { active = "development"; }, release, writes, calls };
}

test("인증 확인 중 서버를 전환하면 다른 프로젝트에 쓰지 않고 중단한다", async () => {
  const f = await actionFixture(); const run = f.run();
  f.switchEnvironment(); f.release();
  const result = await run;
  assert.deepEqual(f.writes, []);
  assert.equal(result.status, "error");
  assert.deepEqual(f.calls, ["production"]);
});

test("전환이 없으면 선택한 프로젝트에만 기존 작업을 수행한다", async () => {
  const f = await actionFixture(); const run = f.run(); f.release();
  assert.equal((await run).status, "success");
  assert.deepEqual(f.writes, ["production"]);
});

// The auth result and database client have been selected before the UI changes.
test("계정 조치 API에도 인증한 환경을 전달하여 이후 선택값을 다시 읽지 않는다", async () => {
  const f = await actionFixture(true); const run = f.run(); f.release();
  assert.equal((await run).status, "success");
  assert.deepEqual(f.writes, ["production"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { buildSync } from "esbuild";
import type { getBrowserSupabaseClient } from "../src/lib/supabase/browser.ts";
import type * as Environment from "../src/lib/environment.ts";
import type { callAdminApi } from "../src/lib/admin-api.ts";
import type { signInAction, signOutAction } from "../src/lib/auth/actions.ts";
import type { runSyncAction } from "../src/lib/sync/actions.ts";
import type * as AppReleases from "../src/lib/admin/app-releases.ts";

// Run the actual browser bundle (including @supabase/ssr), so its default
// singleton behavior is exercised rather than mocked out.
const bundles = [false, true].map(developmentOnly => buildSync({
  stdin: {
    contents: `export * from "./src/lib/supabase/browser";
      export * from "./src/lib/environment";
      export * from "./src/lib/admin-api";
      export * from "./src/lib/auth/actions";
      export * from "./src/lib/admin/app-releases";
      export * from "./src/lib/sync/actions";`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "app",
  write: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    "process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ONLY": JSON.stringify(String(developmentOnly)),
    "process.env.NEXT_PUBLIC_ADMIN_BASE_PATH": JSON.stringify(developmentOnly ? "/development" : ""),
    "process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT": JSON.stringify("development"),
    "process.env.NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT": JSON.stringify("development"),
    ...Object.fromEntries(["DEVELOPMENT", "PRODUCTION"].flatMap((env) => [
      [`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_URL`, JSON.stringify(`https://${env.toLowerCase()}.example`) ],
      [`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_PUBLISHABLE_KEY`, JSON.stringify(`test-${env}`)],
      [`process.env.NEXT_PUBLIC_KICKON_${env}_ADMIN_API_BASE_URL`, JSON.stringify(`https://${env.toLowerCase()}-api.example/api`)],
    ])),
  },
}).outputFiles[0].text);

function browser(developmentOnly = false) {
  const cookies = new Map<string, string>();
  const storage = new Map<string, string>();
  const requests: { url: string; authorization: string | null; body: string | null }[] = [];
  const timeouts: number[] = [];
  const trackedAbortSignal = new Proxy(AbortSignal, {
    get(target, property, receiver) {
      if (property === "timeout") {
        return (milliseconds: number) => {
          timeouts.push(milliseconds);
          return AbortSignal.timeout(milliseconds);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const document = {
    visibilityState: "hidden",
    get cookie() { return [...cookies].map(([k, v]) => `${k}=${v}`).join("; "); },
    set cookie(value: string) {
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    },
  };
  const window = Object.assign(new EventTarget(), {
    document,
    location: { href: "http://localhost/login" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  const context = vm.createContext({
    window, document, navigator: {}, console,
    URL, URLSearchParams, Headers, Request, Response, FormData, AbortController, WebSocket,
    Event, CustomEvent, TextEncoder, TextDecoder, atob, btoa,
    AbortSignal: trackedAbortSignal,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization"), body: typeof init?.body === "string" ? init.body : null });
      const environment = new URL(url).hostname.split(".")[0];
      const body = url.includes("/auth/v1/token") ? {
        access_token: `test-access-${environment}`,
        refresh_token: `test-refresh-${environment}`,
        expires_in: 3600,
        token_type: "bearer",
        user: { id: `${environment}-user`, email: "qa@example.invalid" },
      } : url.includes("/rest/v1/admin_users")
        ? { role: "super_admin", is_active: true }
        : { environment };
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    },
  });
  vm.runInContext(bundles[developmentOnly ? 1 : 0], context);
  const app = context.app as typeof Environment & typeof AppReleases & {
    getBrowserSupabaseClient: typeof getBrowserSupabaseClient;
    callAdminApi: typeof callAdminApi;
    signInAction: typeof signInAction;
    signOutAction: typeof signOutAction;
    runSyncAction: typeof runSyncAction;
  };
  return { app, cookies, requests, storage, timeouts };
}

test("앱 업데이트 조회·변경·이력은 선택한 환경의 관리자 세션을 사용한다", async () => {
  const { app, requests } = browser();
  const credentials = new FormData();
  credentials.set("email", "qa@example.invalid");
  credentials.set("password", "test-only");
  await app.signInAction({ error: null, email: "" }, credentials);
  try {
    for (const environment of ["development", "production"] as const) {
      app.setActiveConsoleEnvironment(environment);
      await app.getAppReleases();
      let request = requests.at(-1)!;
      assert.equal(new URL(request.url).hostname, `${environment}.example`);
      assert.equal(request.authorization, `Bearer test-access-${environment}`);
      assert.equal(new URL(request.url).searchParams.get("select"), "platform,version,enabled,updated_at");
      for (const platform of ["android", "ios"] as const) {
        await app.saveAppRelease(platform, "1.0.10", false, "  스토어 배포 대기  ");
        request = requests.at(-1)!;
        assert.equal(new URL(request.url).hostname, `${environment}.example`);
        assert.equal(request.authorization, `Bearer test-access-${environment}`);
        assert.equal(new URL(request.url).pathname, "/rest/v1/rpc/admin_set_app_store_release");
        assert.deepEqual(JSON.parse(request.body!), {
          target_platform: platform, release_version: "1.0.10", release_enabled: false, change_reason: "스토어 배포 대기",
        });
      }
      await app.getAppReleaseHistory();
      request = requests.at(-1)!;
      const url = new URL(request.url);
      assert.equal(url.hostname, `${environment}.example`);
      assert.equal(request.authorization, `Bearer test-access-${environment}`);
      assert.equal(url.pathname, "/rest/v1/admin_audit_logs");
      assert.equal(url.searchParams.get("entity_type"), "eq.app_store_releases");
      assert.equal(url.searchParams.get("limit"), "50");
    }
    const count = requests.length;
    for (const [version, reason] of [["1.0.3-beta", "배포 대기"], ["1.0.3", "  "], ["1.0.3", "a".repeat(1001)]]) {
      await assert.rejects(app.saveAppRelease("ios", version, true, reason), /버전 형식과 변경 사유/);
    }
    assert.equal(requests.length, count);
  } finally {
    await app.signOutAction();
  }
});

for (const order of [
  ["development", "production"],
  ["production", "development"],
] as const) {
  test(`${order.join(" → ")} 전환은 클라이언트·세션·API 요청을 분리한다`, async () => {
    const { app, requests, cookies, storage } = browser();
    const seen: string[] = [];
    const unsubscribe = app.subscribeToConsoleEnvironment((env) => seen.push(env));
    const clients = order.map((env) => app.getBrowserSupabaseClient(env)!);
    assert.notEqual(clients[0], clients[1]);

    const formData = new FormData();
    formData.set("email", "qa@example.invalid");
    formData.set("password", "test-only");
    const login = await app.signInAction({ error: null, email: "" }, formData);
    assert.equal(login.error, null);
    assert.deepEqual(
      requests.filter(({ url }) => url.includes("/auth/v1/token")).map(({ url }) => new URL(url).hostname).sort(),
      ["development.example", "production.example"],
    );
    for (const env of order) {
      assert.ok([...cookies.keys()].some((key) => key.startsWith(`kickon-admin-auth-${env}`)));
    }

    // Switching in either direction uses the session created by the single
    // login action, without another credential exchange or page reload.
    for (const env of order) {
      app.setActiveConsoleEnvironment(env);
      assert.equal(app.getActiveConsoleEnvironment(), env);
      assert.equal(storage.get("kickon-console-environment") ?? "development", env);
      await app.callAdminApi("/qa");
      assert.equal(requests.at(-1)?.authorization, `Bearer test-access-${env}`);
      assert.equal(new URL(requests.at(-1)!.url).hostname, `${env}-api.example`);
    }
    assert.equal(requests.filter(({ url }) => url.includes("/auth/v1/token")).length, 2);
    assert.ok(seen.includes(order.at(-1)!));
    unsubscribe();
    await app.signOutAction();
    for (const client of clients) assert.equal((await client.auth.getSession()).data.session, null);
    await Promise.all(clients.map((client) => client.auth.stopAutoRefresh()));
  });
}

test("전체 동기화 요청은 Edge Function 완료를 기다릴 수 있는 전용 제한시간을 사용한다", async () => {
  const { app, timeouts } = browser();
  const credentials = new FormData();
  credentials.set("email", "qa@example.invalid");
  credentials.set("password", "test-only");
  await app.signInAction({ error: null, email: "" }, credentials);

  const formData = new FormData();
  formData.set("operation", "full");
  formData.set("reason", "브라우저 요청 제한시간 검증");
  const before = timeouts.length;
  const result = await app.runSyncAction(
    { status: "idle", message: null, operation: null, completedAt: null },
    formData,
  );

  assert.equal(result.status, "success");
  assert.deepEqual(timeouts.slice(before), [58_000]);
});

test("개발 전용 배포는 운영 저장값·모드 전환을 무시하고 개발 인증만 수행한다", async () => {
  const { app, requests, storage } = browser(true);
  storage.set("kickon-console-environment", "production");
  assert.equal(app.getActiveConsoleEnvironment(), "development");
  app.setActiveConsoleEnvironment("production");
  assert.equal(app.getActiveConsoleEnvironment(), "development");
  const credentials = new FormData();
  credentials.set("email", "qa@example.invalid");
  credentials.set("password", "test-only");
  credentials.set("next", "/development/data-management/?appUpdates=1");
  const result = await app.signInAction({ error: null, email: "" }, credentials);
  assert.equal(result.error, null);
  assert.equal(result.redirectTo, "/data-management/?appUpdates=1");
  await app.saveAppRelease("android", "1.0.3", false, "개발 전용 배포 검증");
  assert.ok(requests.every(request => new URL(request.url).hostname === "development.example"));
  await app.signOutAction();
});

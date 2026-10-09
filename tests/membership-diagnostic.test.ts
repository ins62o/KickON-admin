import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { existsSync } from "node:fs";
import { buildSync } from "esbuild";
import type { AdminIdentity } from "../src/lib/auth/types.ts";
import type { AdminRole } from "../src/lib/auth/permissions.ts";
import type * as Diagnostic from "../src/lib/admin/membership-diagnostic.ts";
import type * as Permissions from "../src/lib/auth/permissions.ts";
import type * as Environment from "../src/lib/environment.ts";
import type { getBrowserSupabaseClient } from "../src/lib/supabase/browser.ts";

const hasFeature = existsSync("src/lib/admin/membership-diagnostic.ts");
const bundle = buildSync({
  stdin: { contents: `export * from './src/lib/auth/permissions'; export * from './src/lib/environment';
    export * from './src/lib/supabase/browser'; ${hasFeature ? "export * from './src/lib/admin/membership-diagnostic';" : ""}`, resolveDir: process.cwd() },
  bundle: true, platform: "browser", format: "iife", globalName: "app", write: false,
  define: {
    "process.env.NODE_ENV": JSON.stringify("test"),
    "process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ONLY": JSON.stringify("false"),
    "process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT": JSON.stringify("development"),
    "process.env.NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT": JSON.stringify("development"),
    ...Object.fromEntries(["DEVELOPMENT", "PRODUCTION"].flatMap(env => [
      [`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_URL`, JSON.stringify(`https://${env.toLowerCase()}.example`)],
      [`process.env.NEXT_PUBLIC_KICKON_${env}_SUPABASE_PUBLISHABLE_KEY`, JSON.stringify(`test-${env}`)],
    ])),
  },
}).outputFiles[0].text;

const valid = { authenticated: true, active_super_admin: true, native_actor_match: true, transaction_isolation: "repeatable read", read_only: true, schema_compatible: true, diagnostic_version: "KICKON_PHASE6D_R3C_V1" };
type Api = typeof Diagnostic & typeof Permissions & typeof Environment & { getBrowserSupabaseClient: typeof getBrowserSupabaseClient };
type Options = { role?: AdminRole; active?: boolean; getUserError?: boolean; rpcError?: boolean; payload?: unknown; thrown?: boolean; onUser?: () => Promise<void> | void; onRpc?: () => Promise<void> | void };
function browser(options: Options = {}) {
  const cookies = new Map<string, string>(); const storage = new Map<string, string>();
  const requests: { url: string; authorization: string | null; method: string; body: string | null }[] = []; const logs: unknown[][] = [];
  const document = { visibilityState: "hidden", get cookie() { return [...cookies].map(([k,v]) => `${k}=${v}`).join("; "); }, set cookie(value: string) { const [pair] = value.split(";"); const i = pair.indexOf("="); cookies.set(pair.slice(0,i), pair.slice(i+1)); } };
  const window = Object.assign(new EventTarget(), { document, location: { href: "http://localhost/diagnostic" }, localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string,v: string) => storage.set(k,v), removeItem: (k: string) => storage.delete(k) } });
  const context = vm.createContext({ window, document, navigator: {}, console: Object.fromEntries(["log","error","warn","info","debug"].map(k => [k,(...v: unknown[]) => logs.push(v)])), URL, URLSearchParams, Headers, Request, Response, FormData, AbortController, AbortSignal, WebSocket, Event, CustomEvent, TextEncoder, TextDecoder, atob, btoa, setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); const authorization = new Headers(init?.headers).get("Authorization"); requests.push({url, authorization, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : null});
      const env = new URL(url).hostname.split(".")[0]; const user = { id: `${env}-user`, email: "qa@example.invalid", aud: "authenticated", role: "authenticated", created_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {} };
      let payload: unknown = {}; let status = 200;
      if (url.includes("/auth/v1/token")) payload = {access_token: `test-access-${env}`, refresh_token: `test-refresh-${env}`, expires_in: 3600, token_type: "bearer", user};
      else if (url.includes("/auth/v1/user")) { await options.onUser?.(); if (options.getUserError) { payload = {message: "sensitive-auth-detail", code: "bad_jwt"}; status = 401; } else payload = user; }
      else if (url.includes("/rest/v1/admin_users")) payload = {role: options.role ?? "super_admin", is_active: options.active ?? true};
      else if (url.includes("/rest/v1/rpc/")) { await options.onRpc?.(); if(options.thrown) throw new Error("sensitive-network-detail"); if (options.rpcError) { payload = {message: "sensitive-rpc-detail", code: "42501", details: "qa@example.invalid"}; status=403; } else payload=options.payload ?? valid; }
      return new Response(JSON.stringify(payload), {status, headers: {"Content-Type":"application/json"}});
    },
  });
  vm.runInContext(bundle,context); const app=context.app as Api;
  async function login(env: "production"|"development" = "production") { app.setActiveConsoleEnvironment(env); const c=app.getBrowserSupabaseClient(env)!; await c.auth.signInWithPassword({email:"qa@example.invalid",password:"synthetic-only"}); await c.auth.stopAutoRefresh(); return c; }
  return {app, requests, logs, login};
}
const admin: AdminIdentity = {userId:"test-only-user",role:"super_admin",displayName:"Synthetic",email:null,isDevelopmentBypass:false};
test("verified super_admin can open the diagnostic screen",()=>{const {app}=browser();assert.equal(app.canAccessMembershipDiagnostic?.(admin,false,false),true);});
for(const role of ["admin","viewer","operator","support","moderator","data_editor"] as const) test(`${role} cannot open the diagnostic screen`,()=>{const {app}=browser();assert.equal(app.canAccessMembershipDiagnostic?.({...admin,role},false,false),false);});
for(const [name,identity,loading,switching] of [["unauthenticated",null,false,false],["loading",admin,true,false],["switching",admin,false,true],["no identity",{...admin,userId:""},false,false]] as const) test(`${name} cannot open the diagnostic screen`,()=>{const {app}=browser();assert.equal(app.canAccessMembershipDiagnostic?.(identity,loading,switching),false);});

test("existing production client validates getUser and sends one empty diagnostic with the same HTTP bearer",async()=>{
 const b=browser(); const c=await b.login(); const start=b.requests.length;const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,true);assert.equal(b.app.getBrowserSupabaseClient("production"),c);
 const calls=b.requests.slice(start);assert.equal(calls.filter(x=>x.url.includes("/auth/v1/user")).length,1);assert.equal(calls.filter(x=>x.url.includes("/rpc/")).length,1);assert.ok(calls.every(x=>new URL(x.url).hostname==="production.example"));assert.ok(calls.every(x=>x.authorization==="Bearer test-access-production"));assert.equal(calls.at(-1)?.method,"POST");assert.equal(calls.at(-1)?.body,"{}");assert.ok(calls.at(-1)?.url.endsWith("/rpc/diagnose_canonical_membership_auth_isolation_v1"));
});
test("no session blocks diagnostic RPC",async()=>{const b=browser();b.app.setActiveConsoleEnvironment("production");const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.length,0);});
test("getUser failure blocks diagnostic RPC and hides raw Auth error",async()=>{const b=browser({getUserError:true});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);assert.ok(!JSON.stringify(r).includes("sensitive"));});
for(const [name,opts] of [["general admin",{role:"admin"}],["viewer",{role:"viewer"}],["inactive super_admin",{active:false}]] as const) test(`${name} is refused by fresh active role lookup`,async()=>{const b=browser(opts);await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);});
test("requested environment different from selected environment is blocked before Auth or RPC",async()=>{const b=browser();await b.login();const n=b.requests.length;const r=await b.app.runMembershipDiagnostic?.("development");assert.equal(r?.ok,false);assert.equal(b.requests.length,n);});
test("environment switching during getUser blocks subsequent role and RPC requests",async()=>{const b=browser({onUser:()=>b.app.setActiveConsoleEnvironment("development")});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);});
test("environment switching during RPC discards the previous environment result",async()=>{const b=browser({onRpc:()=>b.app.setActiveConsoleEnvironment("development")});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,1);});
test("development diagnostic remains in development and is not labelled production",async()=>{const b=browser();await b.login("development");const r=await b.app.runMembershipDiagnostic?.("development");assert.equal(r?.ok,true);const calls=b.requests.filter(x=>x.url.includes("/rpc/")||x.url.includes("/auth/v1/user"));assert.ok(calls.every(x=>new URL(x.url).hostname==="development.example"));});
for(const [name,payload] of [["missing fields",{authenticated:true}],["extra sensitive fields",{...valid,email:"qa@example.invalid"}],["unexpected string",{...valid,transaction_isolation:"sensitive-value"}],["unexpected version",{...valid,diagnostic_version:"sensitive-value"}],["invalid field type",{...valid,authenticated:"true"}]] as const) test(`${name} rejects the whole response without leaking contents`,async()=>{const b=browser({payload});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.ok(!JSON.stringify(r).includes("sensitive")&&!JSON.stringify(r).includes("qa@"));});
test("false results are displayed as FAIL and never changed to PASS",async()=>{const b=browser({payload:{...valid,native_actor_match:false,schema_compatible:false}});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,true);if(r?.ok){const rows=b.app.membershipDiagnosticRows(r.result);assert.equal(rows.length,7);assert.equal(rows.find(x=>x.label==="Native Actor Match")?.value,"FAIL");assert.equal(rows.find(x=>x.label==="Schema Compatible")?.value,"FAIL");}});
test("only seven approved fields are projected for display and no result starts NOT_VERIFIED",()=>{const b=browser();const rows=b.app.membershipDiagnosticRows?.(null);assert.equal(rows?.length,7);assert.ok(rows?.every(x=>x.value==="NOT_VERIFIED"));});
for(const opts of [{rpcError:true},{thrown:true}]) test(`RPC failure is safe and invokes no mutation or alternative RPC (${JSON.stringify(opts)})`,async()=>{const b=browser(opts);await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.ok(!JSON.stringify(r).includes("sensitive"));const calls=b.requests.filter(x=>x.url.includes("/rpc/"));assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith("/rpc/diagnose_canonical_membership_auth_isolation_v1"));assert.equal(b.logs.length,0);});
test("simultaneous clicks cause one RPC and a single-flight refusal",async()=>{let release!:()=>void;const wait=new Promise<void>(r=>{release=r;});const b=browser({onUser:()=>wait});await b.login();const first=b.app.runMembershipDiagnostic?.("production");const second=await b.app.runMembershipDiagnostic?.("production");assert.equal(second?.ok,false);release();assert.equal((await first)?.ok,true);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,1);});
test("import and login have no automatic diagnostic invocation or secret logs",async()=>{const b=browser();assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);await b.login();assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);assert.equal(b.logs.length,0);});

test("environment ABA switch during getUser invalidates invocation even after returning to production",async()=>{const b=browser({onUser:()=>{b.app.setActiveConsoleEnvironment("development");b.app.setActiveConsoleEnvironment("production");}});await b.login();const r=await b.app.runMembershipDiagnostic?.("production");assert.equal(r?.ok,false);assert.equal(b.requests.filter(x=>x.url.includes("/rpc/")).length,0);});

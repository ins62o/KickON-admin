"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getPublicSupabaseConfig } from "@/lib/auth/config";
import { getActiveConsoleEnvironment, subscribeToConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";

const rpcName = "diagnose_canonical_membership_auth_isolation_v1";
const version = "KICKON_PHASE6D_R3C_V1";
const fields = ["authenticated", "active_super_admin", "native_actor_match", "transaction_isolation", "read_only", "schema_compatible", "diagnostic_version"] as const;
const booleanFields = ["authenticated", "active_super_admin", "native_actor_match", "read_only", "schema_compatible"] as const;
const isolationLevels = ["read committed", "repeatable read", "serializable", "read uncommitted"] as const;

export type MembershipDiagnostic = {
  authenticated: boolean;
  active_super_admin: boolean;
  native_actor_match: boolean;
  transaction_isolation: typeof isolationLevels[number];
  read_only: boolean;
  schema_compatible: boolean;
  diagnostic_version: typeof version;
};
export type MembershipDiagnosticRun = { ok: true; result: MembershipDiagnostic } | { ok: false; message: string };
const messages = {
  busy: "인증 상태를 확인하고 있습니다. 잠시 기다려 주세요.",
  environment: "선택한 서버를 확인한 뒤 다시 실행해 주세요.",
  session: "관리자 로그인 상태를 확인한 뒤 다시 실행해 주세요.",
  permission: "활성 최고 관리자만 인증 진단을 실행할 수 있습니다.",
  contract: "진단 응답을 확인할 수 없습니다. 관리자에게 문의해 주세요.",
  rpc: "인증 진단에 실패했습니다. 로그인 상태를 확인한 뒤 다시 실행해 주세요.",
};
let inFlight = false;

function validContract(value: unknown): value is MembershipDiagnostic {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(record, field))
    && booleanFields.every(field => typeof record[field] === "boolean")
    && isolationLevels.some(level => record.transaction_isolation === level)
    && record.diagnostic_version === version;
}

function environmentIsReady(environment: ConsoleEnvironment) {
  if ((environment !== "production" && environment !== "development") || getActiveConsoleEnvironment() !== environment) return false;
  const config = getPublicSupabaseConfig(environment);
  const other = getPublicSupabaseConfig(environment === "production" ? "development" : "production");
  if (!config) return false;
  try {
    const url = new URL(config.url);
    if (url.protocol !== "https:" && !(environment === "development" && ["localhost", "127.0.0.1"].includes(url.hostname))) return false;
    return !other || url.origin !== new URL(other.url).origin;
  } catch {
    return false;
  }
}

/** Called only by the explicit UI action. No new client, login, refresh or logging. */
export async function runMembershipDiagnostic(environment: ConsoleEnvironment): Promise<MembershipDiagnosticRun> {
  if (inFlight) return { ok: false, message: messages.busy };
  inFlight = true;
  let environmentChanged = false;
  let stopWatching: (() => void) | undefined;
  const ready = () => !environmentChanged && environmentIsReady(environment);
  try {
    if (!ready()) return { ok: false, message: messages.environment };
    stopWatching = subscribeToConsoleEnvironment(() => { environmentChanged = true; });
    const client = getBrowserSupabaseClient(environment);
    if (!client) return { ok: false, message: messages.environment };
    const session = await client.auth.getSession();
    if (!ready()) return { ok: false, message: messages.environment };
    if (session.error || !session.data.session) return { ok: false, message: messages.session };
    // Only the existing SDK session is read; this value never leaves the private invocation scope.
    const token = session.data.session.access_token;
    const sessionUser = session.data.session.user.id;
    const user = await client.auth.getUser(token);
    if (!ready()) return { ok: false, message: messages.environment };
    if (user.error || !user.data.user || user.data.user.id !== sessionUser) return { ok: false, message: messages.session };
    // Pin role lookup and RPC to the bearer getUser actually verified, even if the SDK refreshes concurrently.
    const authorization = `Bearer ${token}`;
    const membership = await client.from("admin_users").select("role,is_active")
      .eq("user_id", user.data.user.id).maybeSingle().setHeader("Authorization", authorization).retry(false);
    if (!ready()) return { ok: false, message: messages.environment };
    if (membership.error || membership.data?.role !== "super_admin" || membership.data.is_active !== true) return { ok: false, message: messages.permission };
    const sameSession = async () => {
      const current = await client.auth.getSession();
      return !current.error && current.data.session?.access_token === token && current.data.session.user.id === sessionUser;
    };
    if (!await sameSession()) return { ok: false, message: messages.session };
    if (!ready()) return { ok: false, message: messages.environment };
    const response = await client.rpc(rpcName).setHeader("Authorization", authorization).retry(false)
      .abortSignal(AbortSignal.timeout(15_000));
    if (!ready()) return { ok: false, message: messages.environment };
    if (!await sameSession()) return { ok: false, message: messages.session };
    if (!ready()) return { ok: false, message: messages.environment };
    if (response.error) return { ok: false, message: messages.rpc };
    if (!validContract(response.data)) return { ok: false, message: messages.contract };
    // Reconstruct exactly the approved 7 fields. No identity, token, request or raw error enters UI state.
    return { ok: true, result: {
      authenticated: response.data.authenticated, active_super_admin: response.data.active_super_admin,
      native_actor_match: response.data.native_actor_match, transaction_isolation: response.data.transaction_isolation,
      read_only: response.data.read_only, schema_compatible: response.data.schema_compatible,
      diagnostic_version: response.data.diagnostic_version,
    } };
  } catch {
    return { ok: false, message: messages.rpc };
  } finally {
    stopWatching?.();
    inFlight = false;
  }
}

export function membershipDiagnosticRows(result: MembershipDiagnostic | null) {
  const labels = ["Authenticated", "Active Super Admin", "Native Actor Match", "Transaction Isolation", "Read Only", "Schema Compatible", "Diagnostic Version"];
  return fields.map((field, index) => {
    const value = result?.[field];
    return { label: labels[index], value: value === undefined ? "NOT_VERIFIED" : typeof value === "boolean" ? (value ? "PASS" : "FAIL") : value };
  });
}

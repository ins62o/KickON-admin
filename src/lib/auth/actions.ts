"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isAdminRole } from "@/lib/auth/permissions";
import type { ConsoleEnvironment } from "@/lib/environment";

export type LoginState = {
  error: string | null;
  email: string;
  redirectTo?: string | null;
};

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

const loginEnvironments = ["production", "development"] as const satisfies readonly ConsoleEnvironment[];

async function signOutEveryEnvironment() {
  await Promise.allSettled(loginEnvironments.map(async (environment) => {
    const client = getBrowserSupabaseClient(environment);
    if (client) await client.auth.signOut();
  }));
}

export async function signInAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const clients = loginEnvironments.flatMap((environment) => {
    const client = getBrowserSupabaseClient(environment);
    return client ? [{ environment, client }] : [];
  });

  if (!clients.some(({ environment }) => environment === "production")) {
    return { error: "Supabase 공개 환경 변수가 설정되지 않았습니다.", email };
  }
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 모두 입력해 주세요.", email };
  }

  try {
    const signInResults = await Promise.all(clients.map(async ({ environment, client }) => ({
      environment,
      client,
      result: await client.auth.signInWithPassword({ email, password }),
    })));
    if (signInResults.some(({ result }) => result.error || !result.data.user)) {
      await signOutEveryEnvironment();
      return { error: "로그인 정보를 확인해 주세요.", email };
    }

    const memberships = await Promise.all(signInResults.map(async ({ environment, client, result }) => {
      const membership = await client
        .from("admin_users")
        .select("role, is_active")
        .eq("user_id", result.data.user!.id)
        .maybeSingle();
      return { environment, membership };
    }));
    const invalidMembership = memberships.find(({ membership }) => (
      membership.error || !membership.data?.is_active || !isAdminRole(membership.data.role)
    ));

    if (invalidMembership) {
      await signOutEveryEnvironment();
      return {
        error: invalidMembership.membership.error?.code === "42P01"
          ? "관리자 권한 스키마가 아직 적용되지 않았습니다."
          : `${invalidMembership.environment === "production" ? "운영" : "개발"} 서버에 활성화된 관리자 권한이 없습니다.`,
        email,
      };
    }

    return { error: null, email, redirectTo: nextPath };
  } catch {
    await signOutEveryEnvironment();
    return { error: "관리자 로그인 서버에 연결할 수 없습니다.", email };
  }
}

export async function signOutAction() {
  await signOutEveryEnvironment();
}

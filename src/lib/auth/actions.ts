"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

export type LoginState = {
  error: string | null;
  email: string;
  redirectTo?: string | null;
};

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function signInAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(formData.get("next"));
  const supabase = getBrowserSupabaseClient();

  if (!supabase) {
    return { error: "Supabase 공개 환경 변수가 설정되지 않았습니다.", email };
  }
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 모두 입력해 주세요.", email };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return { error: "로그인 정보를 확인해 주세요.", email };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("admin_users")
    .select("is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (membershipError || !membership?.is_active) {
    await supabase.auth.signOut();
    return {
      error: membershipError?.code === "42P01"
        ? "관리자 권한 스키마가 아직 적용되지 않았습니다."
        : "활성화된 관리자 권한이 없습니다.",
      email,
    };
  }

  return { error: null, email, redirectTo: nextPath };
}

export async function signOutAction() {
  const supabase = getBrowserSupabaseClient();
  if (supabase) await supabase.auth.signOut();
}

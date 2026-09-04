"use client";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isAdminRole } from "@/lib/auth/permissions";
import type { AdminIdentity } from "@/lib/auth/types";

export async function getCurrentBrowserAdmin(): Promise<AdminIdentity | null> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("admin_users")
    .select("role, display_name, is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (membershipError || !membership?.is_active || !isAdminRole(membership.role)) return null;

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    displayName: membership.display_name?.trim() || userData.user.email || "운영자",
    role: membership.role,
    isDevelopmentBypass: false,
  };
}

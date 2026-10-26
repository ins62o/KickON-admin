import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicSupabaseConfig, isAdminAuthRequired } from "./config";
import { hasAdminPermission, isAdminRole, type AdminPermission, type AdminRole } from "./permissions";

export type { AdminRole } from "./permissions";

export type AdminIdentity = {
  userId: string | null;
  email: string | null;
  displayName: string;
  role: AdminRole;
  isDevelopmentBypass: boolean;
};

export async function createAuthServerClient() {
  const config = getPublicSupabaseConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. src/proxy.ts refreshes them.
        }
      },
    },
  });
}

export async function getCurrentAdmin(): Promise<AdminIdentity | null> {
  if (!isAdminAuthRequired()) {
    return {
      userId: null,
      email: null,
      displayName: "로컬 운영자",
      role: "super_admin",
      isDevelopmentBypass: true,
    };
  }

  const supabase = await createAuthServerClient();
  if (!supabase) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("admin_users")
    .select("role, display_name, is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (membershipError || !membership?.is_active) return null;

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    displayName: membership.display_name?.trim() || userData.user.email || "운영자",
    role: isAdminRole(membership.role) ? membership.role : "viewer",
    isDevelopmentBypass: false,
  };
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login?reason=unauthorized");
  return admin;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const admin = await requireAdmin();
  if (!hasAdminPermission(admin.role, permission)) {
    redirect("/?reason=forbidden");
  }
  return admin;
}

export function assertAdminPermission(role: AdminRole, permission: AdminPermission) {
  if (!hasAdminPermission(role, permission)) {
    throw new Error("이 작업을 수행할 관리자 권한이 없습니다.");
  }
}

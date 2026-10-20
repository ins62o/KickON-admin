const roles = ["support", "moderator", "data_editor", "super_admin", "viewer", "operator", "admin"] as const;
export type AdminRole = typeof roles[number];
export type AdminIdentity = { userId: string; email: string | null; displayName: string; role: AdminRole };

export interface AdminAuthPort {
  verifyUser(): Promise<{ id: string; email: string | null } | null>;
  readMembership(userId: string): Promise<unknown>;
  passwordSignIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export function canRevalidateAdminInBackground(admin:AdminIdentity|null,sessionUserId:string|null){
  return admin!==null&&admin.userId===sessionUserId;
}

export async function readAuthorizedAdmin(port: AdminAuthPort): Promise<AdminIdentity | null> {
  const user = await port.verifyUser();
  if (!user?.id) return null;
  const membership = await port.readMembership(user.id);
  if (!membership || typeof membership !== "object") return null;
  const row = membership as Record<string, unknown>;
  if (row.is_active !== true || !roles.some(role => role === row.role)) return null;
  return {
    userId: user.id,
    email: user.email,
    displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name.trim() : user.email || "관리자",
    role: row.role as AdminRole,
  };
}

export async function signInAdmin(port: AdminAuthPort, email: string, password: string): Promise<AdminIdentity> {
  if (!email.trim() || !password) throw new Error("이메일과 비밀번호를 입력해 주세요.");
  try {
    await port.passwordSignIn(email.trim(), password);
    const admin = await readAuthorizedAdmin(port);
    if (!admin) throw new Error("활성화된 관리자 권한이 없는 계정입니다.");
    return admin;
  } catch (error) {
    await port.signOut().catch(() => undefined);
    throw error;
  }
}

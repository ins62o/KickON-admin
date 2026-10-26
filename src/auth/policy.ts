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

export async function signInWithHandoff({source,target,email,password,transfer,isCurrent}:{source:AdminAuthPort;target:AdminAuthPort;email:string;password:string;transfer:()=>Promise<void>;isCurrent:()=>boolean}):Promise<AdminIdentity>{
  try{
    const identity=await signInAdmin(source,email,password);
    if(!isCurrent())throw Error('로그인이 취소됐어요 다시 로그인해 주세요');
    if(source===target)return identity;
    await transfer();
    if(!isCurrent())throw Error('로그인이 취소됐어요 다시 로그인해 주세요');
    const admin=await readAuthorizedAdmin(target);
    if(!isCurrent())throw Error('로그인이 취소됐어요 다시 로그인해 주세요');
    if(!admin||!identity.email||admin.email?.toLowerCase()!==identity.email.toLowerCase())throw Error('선택한 환경의 동일한 관리자 권한을 확인할 수 없어요');
    return admin;
  }catch(error){
    await source.signOut().catch(()=>undefined);
    if(source!==target)await target.signOut().catch(()=>undefined);
    throw error;
  }
}

export type AdminRole =
  | "support"
  | "moderator"
  | "data_editor"
  | "super_admin"
  // 기존 운영 계정과 마이그레이션이 완료되기 전까지 호환합니다.
  | "viewer"
  | "operator"
  | "admin";

export type AdminPermission =
  | "dashboard.read"
  | "users.read"
  | "users.moderate"
  | "support.read"
  | "support.write"
  | "moderation.read"
  | "moderation.write"
  | "data.read"
  | "data.write"
  | "sync.read"
  | "sync.run"
  | "system.read"
  | "audit.read"
  | "admins.manage";

export const adminRoleLabels: Record<AdminRole, string> = {
  support: "고객 지원",
  moderator: "커뮤니티 운영",
  data_editor: "데이터 편집",
  super_admin: "최고 관리자",
  viewer: "조회자 (기존)",
  operator: "운영자 (기존)",
  admin: "관리자 (기존)",
};

const allPermissions: AdminPermission[] = [
  "dashboard.read",
  "users.read",
  "users.moderate",
  "support.read",
  "support.write",
  "moderation.read",
  "moderation.write",
  "data.read",
  "data.write",
  "sync.read",
  "sync.run",
  "system.read",
  "audit.read",
  "admins.manage",
];

const permissionsByRole: Record<AdminRole, readonly AdminPermission[]> = {
  support: ["dashboard.read", "users.read", "support.read", "support.write", "system.read", "audit.read"],
  moderator: [
    "dashboard.read",
    "users.read",
    "users.moderate",
    "moderation.read",
    "moderation.write",
    "system.read",
    "audit.read",
  ],
  data_editor: [
    "dashboard.read",
    "data.read",
    "data.write",
    "sync.read",
    "sync.run",
    "system.read",
    "audit.read",
  ],
  super_admin: allPermissions,
  viewer: ["dashboard.read", "users.read", "support.read", "moderation.read", "data.read", "sync.read", "system.read", "audit.read"],
  operator: allPermissions.filter((permission) => permission !== "admins.manage"),
  admin: allPermissions.filter((permission) => permission !== "admins.manage"),
};

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return permissionsByRole[role]?.includes(permission) ?? false;
}

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && value in permissionsByRole;
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAdminPermission,
  isAdminRole,
  type AdminPermission,
  type AdminRole,
} from "../src/lib/auth/permissions.ts";

const everyPermission: AdminPermission[] = [
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

test("super_admin만 관리자 계정을 관리할 수 있다", () => {
  const roles: AdminRole[] = [
    "support",
    "moderator",
    "data_editor",
    "super_admin",
    "viewer",
    "operator",
    "admin",
  ];

  for (const role of roles) {
    assert.equal(
      hasAdminPermission(role, "admins.manage"),
      role === "super_admin",
      `${role} 역할의 admins.manage 권한이 잘못되었습니다.`,
    );
  }
});

test("지원·운영·데이터 역할은 담당 영역의 쓰기 권한만 가진다", () => {
  assert.equal(hasAdminPermission("support", "support.write"), true);
  assert.equal(hasAdminPermission("support", "moderation.write"), false);
  assert.equal(hasAdminPermission("support", "data.write"), false);

  assert.equal(hasAdminPermission("moderator", "moderation.write"), true);
  assert.equal(hasAdminPermission("moderator", "users.moderate"), true);
  assert.equal(hasAdminPermission("moderator", "support.write"), false);

  assert.equal(hasAdminPermission("data_editor", "data.write"), true);
  assert.equal(hasAdminPermission("data_editor", "sync.run"), true);
  assert.equal(hasAdminPermission("data_editor", "moderation.write"), false);
});

test("super_admin은 정의된 모든 권한을 가진다", () => {
  for (const permission of everyPermission) {
    assert.equal(hasAdminPermission("super_admin", permission), true, permission);
  }
});

test("알 수 없는 역할은 관리자 역할로 인정하지 않는다", () => {
  assert.equal(isAdminRole("support"), true);
  assert.equal(isAdminRole("SUPER_ADMIN"), false);
  assert.equal(isAdminRole("member"), false);
  assert.equal(isAdminRole(null), false);
});

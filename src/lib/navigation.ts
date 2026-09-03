import {
  DatabaseZap,
  Headphones,
  LayoutDashboard,
  Trophy,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { hasAdminPermission, type AdminPermission, type AdminRole } from "@/lib/auth/permissions";

export type NavigationItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  requiredPermission: AdminPermission;
  alternativePermissions?: readonly AdminPermission[];
  activeHrefs?: readonly string[];
};

export type NavigationGroup = { label: string; items: NavigationItem[] };

export const navigationGroups: NavigationGroup[] = [
  {
    label: "운영",
    items: [
      { key: "dashboard", label: "대시보드", href: "/", icon: LayoutDashboard, description: "서비스 운영 현황", requiredPermission: "dashboard.read" },
      { key: "users", label: "사용자", href: "/users", icon: UsersRound, description: "가입자와 계정 상태", requiredPermission: "users.read" },
      { key: "inquiries", label: "문의 신고", href: "/inquiries", icon: Headphones, description: "1:1 문의와 신고 내역", requiredPermission: "support.read", alternativePermissions: ["moderation.read"] },
    ],
  },
  {
    label: "축구 데이터",
    items: [
      { key: "squads", label: "선수 관리", href: "/squads", icon: UserRoundCog, description: "선수와 팀 소속 관리", requiredPermission: "data.read" },
      { key: "standings", label: "팀 관리", href: "/standings", icon: Trophy, description: "리그 순위 비교와 보정", requiredPermission: "data.read" },
    ],
  },
  {
    label: "시스템",
    items: [
      { key: "data-management", label: "데이터 관리", href: "/data-management", icon: DatabaseZap, description: "데이터 동기화와 사용량, 관리자 로그", requiredPermission: "sync.read", alternativePermissions: ["system.read", "audit.read"], activeHrefs: ["/sync", "/usage", "/audit"] },
    ],
  },
];

export function navigationGroupsForRole(role: AdminRole) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        hasAdminPermission(role, item.requiredPermission) ||
        item.alternativePermissions?.some((permission) => hasAdminPermission(role, permission))
      )),
    }))
    .filter((group) => group.items.length > 0);
}

export function isNavigationItemActive(pathname: string, item: NavigationItem) {
  const hrefs = [item.href, ...(item.activeHrefs ?? [])];
  return hrefs.some((href) => (
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`)
  ));
}

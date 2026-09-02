import {
  Activity,
  DatabaseZap,
  Headphones,
  History,
  LayoutDashboard,
  ShieldAlert,
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
};

export type NavigationGroup = { label: string; items: NavigationItem[] };

export const navigationGroups: NavigationGroup[] = [
  {
    label: "운영",
    items: [
      { key: "dashboard", label: "대시보드", href: "/", icon: LayoutDashboard, description: "서비스 운영 현황", requiredPermission: "dashboard.read" },
      { key: "users", label: "사용자", href: "/users", icon: UsersRound, description: "가입자와 계정 상태", requiredPermission: "users.read" },
      { key: "inquiries", label: "1:1 문의", href: "/inquiries", icon: Headphones, description: "사용자 문의 처리", requiredPermission: "support.read" },
      { key: "moderation", label: "신고 및 커뮤니티 관리", href: "/moderation", icon: ShieldAlert, description: "신고와 콘텐츠 조치", requiredPermission: "moderation.read" },
    ],
  },
  {
    label: "축구 데이터",
    items: [
      { key: "squads", label: "선수단 관리", href: "/squads", icon: UserRoundCog, description: "선수와 팀 소속 관리", requiredPermission: "data.read" },
      { key: "standings", label: "순위 관리", href: "/standings", icon: Trophy, description: "리그 순위 비교와 보정", requiredPermission: "data.read" },
      { key: "sync", label: "데이터 동기화", href: "/sync", icon: DatabaseZap, description: "SportsMonks 동기화", requiredPermission: "sync.read" },
    ],
  },
  {
    label: "시스템",
    items: [
      { key: "usage", label: "사용량 및 시스템 상태", href: "/usage", icon: Activity, description: "DB·스토리지·API 상태", requiredPermission: "system.read" },
      { key: "audit", label: "관리자 감사 로그", href: "/audit", icon: History, description: "관리자 변경 이력", requiredPermission: "audit.read" },
    ],
  },
];

export function navigationGroupsForRole(role: AdminRole) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasAdminPermission(role, item.requiredPermission)),
    }))
    .filter((group) => group.items.length > 0);
}

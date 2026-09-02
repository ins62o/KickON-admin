import Link from "next/link";
import { Activity, DatabaseZap, History, type LucideIcon } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { hasAdminPermission, type AdminPermission, type AdminRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export type DataManagementSection = "sync" | "usage" | "audit";

type DataManagementTab = {
  id: DataManagementSection;
  label: string;
  href: string;
  icon: LucideIcon;
  permission: AdminPermission;
};

const dataManagementTabs: readonly DataManagementTab[] = [
  { id: "sync", label: "데이터 동기화", href: "/sync", icon: DatabaseZap, permission: "sync.read" },
  { id: "usage", label: "사용량 및 시스템 상태", href: "/usage", icon: Activity, permission: "system.read" },
  { id: "audit", label: "관리자 로그", href: "/audit", icon: History, permission: "audit.read" },
];

export function DataManagementHeader({
  role,
  activeSection,
}: {
  role: AdminRole;
  activeSection: DataManagementSection;
}) {
  const availableTabs = dataManagementTabs.filter((tab) => hasAdminPermission(role, tab.permission));

  return (
    <div>
      <PageHeader title="데이터 관리" />
      <nav className="mt-5 overflow-x-auto border-b border-border/70" aria-label="데이터 관리 메뉴">
        <ul className="-mb-px flex min-w-max gap-1">
          {availableTabs.map((tab) => {
            const active = tab.id === activeSection;
            const Icon = tab.icon;

            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

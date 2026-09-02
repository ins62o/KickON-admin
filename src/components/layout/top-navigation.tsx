"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminRole } from "@/lib/auth/permissions";
import { navigationGroupsForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function TopNavigation({ role }: { role: AdminRole }) {
  const pathname = usePathname();
  const items = navigationGroupsForRole(role).flatMap((group) => group.items);

  return (
    <nav className="hidden min-w-0 flex-1 self-stretch xl:flex xl:items-stretch xl:justify-center" aria-label="주요 메뉴">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.description}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-[68px] shrink-0 items-center whitespace-nowrap border-b-2 px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring 2xl:px-3 2xl:text-[15px]",
              active
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-foreground/70 hover:border-border hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

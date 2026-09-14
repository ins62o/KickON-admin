"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminRole } from "@/lib/auth/permissions";
import { isNavigationItemActive, navigationGroupsForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNavigation({ role }: { role: AdminRole }) {
  const pathname = usePathname();
  const groups = navigationGroupsForRole(role);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 xl:hidden" aria-label="메뉴 열기">
          <Menu className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-border bg-background p-0 text-foreground">
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle className="flex items-center gap-2.5 text-foreground">
            <Image src="/branding/app-logo.png" alt="" width={32} height={32} className="size-8 object-contain" />
            <span>KICKON</span>
          </SheetTitle>
          <SheetDescription className="sr-only">KICKON 운영 메뉴</SheetDescription>
        </SheetHeader>
        <nav className="max-h-[calc(100dvh-5rem)] overflow-y-auto px-3 py-4" aria-label="모바일 주요 메뉴">
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 px-2 text-[10px] font-extrabold tracking-[0.16em] text-muted-foreground/65 uppercase">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isNavigationItemActive(pathname, item);
                    const Icon = item.icon;

                    return (
                      <SheetClose asChild key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium",
                            active
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/80 hover:bg-accent/65 hover:text-foreground",
                          )}
                        >
                          <Icon
                            className={cn("size-4", active ? "text-primary" : "text-muted-foreground/80")}
                            aria-hidden="true"
                          />
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

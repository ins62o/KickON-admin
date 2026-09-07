"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, LogOut, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";
import { adminRoleLabels } from "@/lib/auth/permissions";
import type { AdminIdentity } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { environmentLabel, setActiveConsoleEnvironment, useConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-toggle";
import { TopNavigation } from "./top-navigation";

const environmentOptions = [
  {
    key: "development",
    label: "개발 서버",
    dotClassName: "bg-sky-500",
  },
  {
    key: "production",
    label: "운영 서버",
    dotClassName: "bg-emerald-500",
  },
] satisfies ReadonlyArray<{
  key: ConsoleEnvironment;
  label: string;
  dotClassName: string;
}>;

export function Header({ admin, loading = false, switching = false }: {
  admin: AdminIdentity | null;
  loading?: boolean;
  switching?: boolean;
}) {
  const currentEnvironment = useConsoleEnvironment();
  const isProduction = currentEnvironment === "production";
  const currentLabel = environmentLabel(currentEnvironment);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background">
      <div className="mx-auto flex h-[68px] w-full max-w-[1720px] items-center gap-2 px-4 lg:gap-3 lg:px-6">
        {admin ? <MobileNavigation role={admin.role} /> : <span className="size-11 shrink-0 xl:hidden" aria-hidden="true" />}
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="킥온 대시보드">
          <span className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-[#08111e]">
            <Image src="/branding/app-logo.png" alt="" width={44} height={32} priority className="h-8 w-11 object-contain" />
          </span>
          <span className="hidden text-base font-semibold leading-none tracking-tight sm:block">KICKON</span>
        </Link>

        {admin ? <TopNavigation role={admin.role} /> : <span className="hidden min-w-0 flex-1 xl:block" aria-hidden="true" />}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="size-11 gap-2 border-border/80 bg-card/50 px-0 shadow-none md:w-auto md:px-3 xl:h-9"
                aria-label={`${currentLabel}${switching ? " 전환 중" : ""} 계정 메뉴 열기`}
                title={`${currentLabel}${switching ? " 전환 중" : ""} · 계정 메뉴`}
                aria-busy={switching}
              >
                <span className={cn("size-2 shrink-0 rounded-full", isProduction ? "bg-emerald-500" : "bg-sky-500")} aria-hidden="true" />
                <span className="hidden text-[13px] md:inline">{currentLabel}</span>
                <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-xl border border-border/90 p-1.5 shadow-2xl shadow-black/25">
              <DropdownMenuLabel className="px-2.5 py-2 text-[11px] font-medium tracking-wide text-muted-foreground">현재 접속 환경</DropdownMenuLabel>
              <div className="flex items-center gap-3 rounded-lg bg-muted/45 px-2.5 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60">
                  <Server className="size-4 text-muted-foreground" aria-hidden="true" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-sm font-semibold">{currentLabel}{switching ? " 전환 중" : ""}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {admin ? adminRoleLabels[admin.role] : loading ? "세션 확인 중" : "로그인 필요"}
                  </p>
                </div>
              </div>
              <DropdownMenuSeparator className="my-1.5" />
              <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">모드 전환</DropdownMenuLabel>
              {environmentOptions.map((option) => {
                const isCurrent = option.key === currentEnvironment;
                const content = (
                  <>
                    <span className={cn("size-2 shrink-0 rounded-full", option.dotClassName)} aria-hidden="true" />
                    <span className="font-medium">{option.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {isCurrent ? "현재 접속" : "전환"}
                    </span>
                    {isCurrent ? (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    ) : null}
                  </>
                );

                return (
                  <DropdownMenuItem
                    key={option.key}
                    disabled={isCurrent || switching}
                    onSelect={() => {
                      if (!isCurrent) setActiveConsoleEnvironment(option.key);
                    }}
                    className={cn(
                      "min-h-10 rounded-lg px-2.5 py-2",
                      !isCurrent && !switching && "cursor-pointer",
                      isCurrent && "data-disabled:opacity-100",
                    )}
                  >
                    {content}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator className="my-1.5" />
              <form onSubmit={async (event) => {
                event.preventDefault();
                await signOutAction();
              }}>
                <DropdownMenuItem asChild variant="destructive" className="cursor-pointer rounded-lg p-0">
                  <button type="submit" disabled={!admin || switching} className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50">
                    <LogOut className="size-4" aria-hidden="true" />
                    로그아웃
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

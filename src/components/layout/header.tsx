import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, ExternalLink, LogOut, Server } from "lucide-react";
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
import type { AdminIdentity } from "@/lib/auth/server";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./global-search";
import { MobileNavigation } from "./mobile-navigation";
import { ThemeToggle } from "./theme-toggle";
import { TopNavigation } from "./top-navigation";

type ConsoleEnvironment = "development" | "production";

function getConsoleUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function Header({ admin }: { admin: AdminIdentity }) {
  const isProduction = process.env.KICKON_ENVIRONMENT === "production";
  const currentEnvironment: ConsoleEnvironment = isProduction ? "production" : "development";
  const environmentLabel = isProduction ? "운영 서버" : "개발 서버";
  const environmentOptions: Array<{
    key: ConsoleEnvironment;
    label: string;
    url: string | null;
    dotClassName: string;
  }> = [
    {
      key: "development",
      label: "개발 서버",
      url: getConsoleUrl(process.env.KICKON_DEVELOPMENT_ADMIN_URL),
      dotClassName: "bg-sky-500",
    },
    {
      key: "production",
      label: "운영 서버",
      url: getConsoleUrl(process.env.KICKON_PRODUCTION_ADMIN_URL),
      dotClassName: "bg-emerald-500",
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background">
      <div className="mx-auto flex h-[68px] w-full max-w-[1720px] items-center gap-2 px-4 lg:gap-3 lg:px-6">
        <MobileNavigation role={admin.role} />
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="킥온 대시보드">
          <span className="flex h-9 w-11 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-[#08111e]">
            <Image src="/branding/app-logo.png" alt="" width={44} height={32} priority className="h-8 w-11 object-contain" />
          </span>
          <span className="hidden text-base font-semibold leading-none tracking-tight sm:block">KICKON</span>
        </Link>

        <TopNavigation role={admin.role} />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <GlobalSearch compact role={admin.role} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="size-11 gap-2 border-border/80 bg-card/50 px-0 shadow-none md:w-auto md:px-3 xl:h-9"
                aria-label={`${environmentLabel} 계정 메뉴 열기`}
                title={`${environmentLabel} · 계정 메뉴`}
              >
                <span className={cn("size-2 shrink-0 rounded-full", isProduction ? "bg-emerald-500" : "bg-sky-500")} aria-hidden="true" />
                <span className="hidden text-[13px] font-semibold md:inline">{environmentLabel}</span>
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
                  <p className="text-sm font-semibold">{environmentLabel}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{adminRoleLabels[admin.role]}</p>
                </div>
              </div>
              <DropdownMenuSeparator className="my-1.5" />
              <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground">서버 전환</DropdownMenuLabel>
              {environmentOptions.map((option) => {
                const isCurrent = option.key === currentEnvironment;
                const content = (
                  <>
                    <span className={cn("size-2 shrink-0 rounded-full", option.dotClassName)} aria-hidden="true" />
                    <span className="font-medium">{option.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {isCurrent ? "현재 접속" : option.url ? "이동" : "주소 설정 필요"}
                    </span>
                    {isCurrent ? (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    ) : option.url ? (
                      <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    ) : null}
                  </>
                );

                if (isCurrent || !option.url) {
                  return (
                    <DropdownMenuItem
                      key={option.key}
                      disabled
                      className={cn(
                        "min-h-10 rounded-lg px-2.5 py-2",
                        isCurrent && "data-disabled:opacity-100",
                      )}
                    >
                      {content}
                    </DropdownMenuItem>
                  );
                }

                return (
                  <DropdownMenuItem key={option.key} asChild className="min-h-10 cursor-pointer rounded-lg p-0">
                    <a href={option.url} className="flex w-full items-center gap-2 px-2.5 py-2">
                      {content}
                    </a>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator className="my-1.5" />
              <form action={signOutAction}>
                <DropdownMenuItem asChild variant="destructive" className="cursor-pointer rounded-lg p-0">
                  <button type="submit" className="flex w-full cursor-pointer items-center gap-2.5 px-2.5 py-2.5 text-left">
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Headphones,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldAlert,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { AdminRole } from "@/lib/auth/permissions";
import { navigationGroupsForRole } from "@/lib/navigation";
import { searchAdminData } from "@/lib/search/client";
import type { GlobalSearchItem } from "@/lib/search/types";
import { cn } from "@/lib/utils";

const resultIcons: Record<GlobalSearchItem["type"], LucideIcon> = {
  user: UsersRound,
  inquiry: Headphones,
  moderation: ShieldAlert,
  player: UserRoundCog,
};

const resultLabels: Record<GlobalSearchItem["type"], string> = {
  user: "사용자",
  inquiry: "1:1 문의",
  moderation: "신고",
  player: "선수",
};

function resultHref(item: GlobalSearchItem) {
  return item.href;
}

export function GlobalSearch({ compact = false, role }: { compact?: boolean; role: AdminRole }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GlobalSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const router = useRouter();
  const menuItems = navigationGroupsForRole(role).flatMap((group) => group.items);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || normalizedQuery.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const payload = await searchAdminData(normalizedQuery, role);
        if (controller.signal.aborted) return;
        setItems(payload.items ?? []);
        setError(payload.error ?? null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setItems([]);
        setError(caught instanceof Error ? caught.message : "검색 결과를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, retryKey, role]);

  const normalizedQuery = query.trim();
  const visibleItems = open && normalizedQuery.length >= 2 ? items : [];
  const isSearching = open && normalizedQuery.length >= 2 && loading;

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      setItems([]);
      setLoading(false);
      setError(null);
      setRetryKey(0);
    }
  };

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setItems([]);
    setLoading(false);
    setError(null);
  };

  const retry = () => {
    setItems([]);
    setLoading(false);
    setError(null);
    setRetryKey((value) => value + 1);
  };

  const navigate = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        variant="outline"
        className={cn(
          "h-9 gap-2 border-border/80 bg-background/60 text-muted-foreground shadow-none hover:bg-muted/60 hover:text-foreground",
          compact ? "size-11 justify-center p-0 xl:size-9" : "w-[min(24rem,42vw)] justify-start px-3",
        )}
        onClick={() => setOpen(true)}
        aria-label={compact ? "전역 검색 열기" : undefined}
        title={compact ? "전역 검색 (⌘ K)" : undefined}
      >
        <Search className="block size-4" aria-hidden="true" />
        <span className={cn("truncate text-xs sm:text-sm", compact && "sr-only")}>메뉴, 사용자, 문의, 신고, 선수 검색</span>
        {!compact ? <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">⌘ K</kbd> : null}
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title="전역 검색"
        description="권한이 있는 관리 메뉴와 운영 데이터를 검색합니다."
      >
        <CommandInput
          value={query}
          onValueChange={changeQuery}
          placeholder="메뉴, 닉네임, 문의, 신고 원문 또는 선수명"
        />
        <CommandList>
          <CommandEmpty>
            {isSearching ? "검색 중입니다." : normalizedQuery.length < 2 ? "두 글자 이상 입력해 주세요." : "검색 결과가 없습니다."}
          </CommandEmpty>
          <CommandGroup heading="메뉴">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.description}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {visibleItems.length > 0 ? <CommandSeparator /> : null}
          {visibleItems.length > 0 ? (
            <CommandGroup heading="운영 데이터">
              {visibleItems.map((item) => {
                const Icon = resultIcons[item.type];
                return (
                  <CommandItem
                    key={item.id}
                    value={`${normalizedQuery} ${item.label} ${item.description} ${item.keywords}`}
                    onSelect={() => navigate(resultHref(item))}
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{item.label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{item.description}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-[10px] font-medium text-muted-foreground">{resultLabels[item.type]}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}

          {isSearching ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground" role="status" aria-live="polite">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              운영 데이터 검색 중…
            </div>
          ) : null}
          {error ? (
            <div className="mx-2 mb-2 flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
              <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{error}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={retry}
              >
                <RotateCcw className="size-3" aria-hidden="true" />
                재시도
              </Button>
            </div>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}

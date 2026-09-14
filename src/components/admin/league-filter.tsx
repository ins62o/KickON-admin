"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_LEAGUE_ID, isLeagueId, SUPPORTED_LEAGUES, type LeagueFilter as Filter } from "@/lib/football/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function useLeagueFilter(allowAll = true): Filter {
  const params = useSearchParams();
  const value = params.get("leagueId");
  return isLeagueId(value) ? value : allowAll ? "all" : DEFAULT_LEAGUE_ID;
}

export function LeagueFilter({ allowAll = true, className }: { allowAll?: boolean; className?: string }) {
  const value = useLeagueFilter(allowAll);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  return <div className={cn("my-5 flex flex-wrap items-center gap-3", className)}>
    <Select value={value} onValueChange={(next) => {
      const query = new URLSearchParams(params.toString());
      query.set("leagueId", next);
      for (const key of ["q", "search", "page", "teamId", "fixtureId", "operation"]) query.delete(key);
      router.push(`${pathname}?${query}`, { scroll: false });
    }}>
      <SelectTrigger className="w-40 tracking-normal" aria-label="리그 선택"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">{allowAll ? <SelectItem value="all" className="py-2 pr-8 pl-2.5">전체</SelectItem> : null}{SUPPORTED_LEAGUES.map((league) => <SelectItem key={league.id} value={league.id} className="py-2 pr-8 pl-2.5">{league.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

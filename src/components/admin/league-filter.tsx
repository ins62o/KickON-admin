"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_LEAGUE_ID, isLeagueId, SUPPORTED_LEAGUES, type LeagueFilter as Filter } from "@/lib/football/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function useLeagueFilter(allowAll = true): Filter {
  const params = useSearchParams();
  const value = params.get("leagueId");
  return isLeagueId(value) ? value : allowAll ? "all" : DEFAULT_LEAGUE_ID;
}

export function LeagueFilter({ allowAll = true }: { allowAll?: boolean }) {
  const value = useLeagueFilter(allowAll);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  return <div className="my-5 flex flex-wrap items-center gap-3">
    <Select value={value} onValueChange={(next) => {
      const query = new URLSearchParams(params.toString());
      query.set("leagueId", next);
      for (const key of ["q", "search", "page", "teamId", "fixtureId", "operation"]) query.delete(key);
      router.push(`${pathname}?${query}`, { scroll: false });
    }}>
      <SelectTrigger className="h-11! w-40 rounded-xl border-primary/25 bg-linear-to-br from-primary/12 to-primary/4 px-3 text-sm font-medium tracking-normal shadow-sm hover:border-primary/45 hover:from-primary/18 data-[state=open]:border-primary/55 data-[state=open]:ring-3 data-[state=open]:ring-primary/15" aria-label="리그 선택"><SelectValue /></SelectTrigger>
      <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) min-w-0 rounded-xl border border-border/80 bg-popover p-0 py-1.5 shadow-2xl">{allowAll ? <SelectItem value="all" className="mx-1.5 my-0.5 h-10 w-[calc(100%-0.75rem)] rounded-lg pr-9 pl-3 text-sm font-medium tracking-normal focus:bg-primary/10">전체</SelectItem> : null}{SUPPORTED_LEAGUES.map((league) => <SelectItem key={league.id} value={league.id} className="mx-1.5 my-0.5 h-10 w-[calc(100%-0.75rem)] rounded-lg pr-9 pl-3 text-sm font-medium tracking-normal focus:bg-primary/10">{league.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

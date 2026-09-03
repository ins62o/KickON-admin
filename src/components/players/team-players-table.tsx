"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, MapPin, UsersRound } from "lucide-react";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlayerRecord } from "@/lib/data/types";
import { positionLabel } from "@/lib/football-labels";

const positions = [
  { value: "골키퍼", label: "골키퍼", dot: "bg-yellow-400" },
  { value: "수비수", label: "수비수", dot: "bg-blue-500" },
  { value: "미드필더", label: "미드필더", dot: "bg-emerald-500" },
  { value: "공격수", label: "공격수", dot: "bg-red-500" },
];

type SortKey = "shirtNumber" | "age" | "appearances" | "goals" | "assists";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

export function TeamPlayersTable({ players }: { players: PlayerRecord[] }) {
  const [position, setPosition] = useState("all");
  const [sort, setSort] = useState<SortState>(null);
  const selectedPosition = positions.find((item) => item.value === position);
  const filteredPlayers = useMemo(
    () => {
      const filtered = position === "all" ? players : players.filter((player) => positionLabel(player.position) === position);
      if (!sort) return filtered;
      return [...filtered].sort((a, b) => {
        const aValue = a[sort.key];
        const bValue = b[sort.key];
        const aMissing = aValue === null || aValue === undefined;
        const bMissing = bValue === null || bValue === undefined;
        if (aMissing && bMissing) return 0;
        if (aMissing) return 1;
        if (bMissing) return -1;
        const difference = aValue - bValue;
        return sort.direction === "asc" ? difference : -difference;
      });
    },
    [players, position, sort],
  );

  function toggleSort(key: SortKey) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" });
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="team-players-title">
      <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="team-players-title" className="text-base font-semibold">선수 구성원</h2>
        <div className="flex items-center gap-3">
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger className="h-10! w-44 cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {selectedPosition ? <span className={`size-2 shrink-0 rounded-full ${selectedPosition.dot}`} aria-hidden="true" /> : <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true"><MapPin className="size-3" /></span>}
                <span className="truncate text-foreground">{selectedPosition?.label ?? "모든 포지션"}</span>
              </span>
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
              <SelectItem value="all" className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary"><MapPin className="size-3" /></span>모든 포지션</SelectItem>
              {positions.map((item) => <SelectItem key={item.value} value={item.value} className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className={`size-2 shrink-0 rounded-full ${item.dot}`} aria-hidden="true" />{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="min-w-12 text-right text-sm font-semibold tabular text-foreground">{filteredPlayers.length}명</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[960px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[34%] pl-5 text-sm font-semibold">선수</TableHead>
              <SortableHead label="등번호" sortKey="shirtNumber" sort={sort} onSort={toggleSort} className="w-[10%]" buttonClassName="justify-center" />
              <TableHead className="w-[16%] text-sm font-semibold">포지션</TableHead>
              <SortableHead label="나이" sortKey="age" sort={sort} onSort={toggleSort} className="w-[10%]" buttonClassName="justify-end" />
              <SortableHead label="출전" sortKey="appearances" sort={sort} onSort={toggleSort} className="w-[10%]" buttonClassName="justify-end" />
              <SortableHead label="득점" sortKey="goals" sort={sort} onSort={toggleSort} className="w-[10%]" buttonClassName="justify-end" />
              <SortableHead label="도움" sortKey="assists" sort={sort} onSort={toggleSort} className="w-[10%] pr-5" buttonClassName="justify-end" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlayers.length > 0 ? filteredPlayers.map((player) => {
              const displayName = player.koreanName ?? player.displayName ?? player.name;
              return <ClickableTableRow key={player.id} href={`/squads/${player.id}`} className="hover:bg-muted/30">
                <TableCell className="py-4 pl-5"><Link href={`/squads/${player.id}`} className="block min-w-44 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="truncate text-base font-semibold text-foreground">{displayName}</p>{displayName !== player.name ? <p className="mt-1 truncate text-sm text-muted-foreground">{player.name}</p> : null}</Link></TableCell>
                <TableCell className="tabular py-4 text-center font-mono text-sm">{player.shirtNumber ?? "-"}</TableCell>
                <TableCell className="py-4 text-sm">{positionLabel(player.position)}</TableCell>
                <TableCell className="tabular py-4 text-right text-sm">{player.age === null ? "-" : `${player.age}세`}</TableCell>
                <TableCell className="tabular py-4 text-right text-sm">{player.appearances}</TableCell>
                <TableCell className="tabular py-4 text-right text-sm">{player.goals}</TableCell>
                <TableCell className="tabular py-4 pr-5 text-right text-sm">{player.assists}</TableCell>
              </ClickableTableRow>;
            }) : <TableRow><TableCell colSpan={7} className="h-56 text-center"><div className="flex flex-col items-center gap-3 text-muted-foreground"><UsersRound className="size-6" /><p className="text-sm">선택한 포지션의 선수가 없습니다.</p></div></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function SortableHead({ label, sortKey, sort, onSort, className, buttonClassName }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void; className?: string; buttonClassName?: string }) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`text-sm font-semibold ${className ?? ""}`}>
      <button type="button" onClick={() => onSort(sortKey)} className={`flex h-full w-full cursor-pointer items-center gap-1.5 rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${buttonClassName ?? ""}`}>
        {label}<Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </button>
    </TableHead>
  );
}

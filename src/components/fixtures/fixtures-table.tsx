"use client";

import { fixtureHref } from "@/lib/football/config";
import Link from "next/link";
import type { LegacyColumnDef, LegacyRow } from "@tanstack/react-table/legacy";
import { ArrowUpRight } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { StatusBadge } from "@/components/status-badge";
import { fixtureStatusLabels } from "@/lib/data/catalog";
import type { FixtureRecord } from "@/lib/data/types";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";

const fixtureSearchFilter = (row: LegacyRow<FixtureRecord>, _columnId: string, value: unknown) => {
  const query = String(value).trim().toLocaleLowerCase("ko-KR");
  if (!query) return true;
  const fixture = row.original;
  return [fixture.id, fixture.homeTeamName, fixture.awayTeamName, fixture.stadiumName]
    .some((item) => item.toLocaleLowerCase("ko-KR").includes(query));
};

const teamFilter = (row: LegacyRow<FixtureRecord>, _columnId: string, value: unknown) => {
  return row.original.homeTeamId === value || row.original.awayTeamId === value;
};

function koreaDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

const periodFilter = (row: LegacyRow<FixtureRecord>, _columnId: string, value: unknown) => {
  const today = koreaDateKey(new Date().toISOString());
  const fixtureDate = koreaDateKey(row.original.kickoffAt);
  const offset = Math.round((new Date(`${fixtureDate}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86_400_000);
  if (value === "today") return offset === 0;
  if (value === "yesterday") return offset === -1;
  if (value === "tomorrow") return offset === 1;
  if (value === "last7") return offset >= -7 && offset <= 0;
  return true;
};

function fixtureHealth(status: FixtureRecord["status"]) {
  if (status === "LIVE") return "warning" as const;
  if (status === "CANCELED") return "danger" as const;
  return "normal" as const;
}

const columns: LegacyColumnDef<FixtureRecord>[] = [
  {
    id: "fixture",
    accessorFn: (fixture) => `${fixture.homeTeamName} ${fixture.awayTeamName}`,
    filterFn: fixtureSearchFilter,
    header: "경기",
    cell: ({ row }) => {
      const fixture = row.original;
      return (
        <Link href={fixtureHref(fixture)} className="group grid min-w-80 grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="truncate text-right font-medium group-hover:text-primary">{fixture.homeTeamName}</span>
          <span className="tabular min-w-14 rounded-md bg-muted px-2 py-1 text-center font-mono text-sm font-semibold">
            {fixture.status === "SCHEDULED" ? "vs" : `${fixture.homeScore ?? "-"} : ${fixture.awayScore ?? "-"}`}
          </span>
          <span className="flex items-center gap-1 truncate font-medium group-hover:text-primary">{fixture.awayTeamName}<ArrowUpRight className="size-3 text-muted-foreground/40" /></span>
        </Link>
      );
    },
  },
  { accessorKey: "kickoffAt", header: ({ column }) => <DataTableColumnHeader column={column} title="경기 일시" />, cell: ({ row }) => <span className="tabular whitespace-nowrap">{formatKoreaDateTime(row.original.kickoffAt)}</span> },
  { accessorKey: "status", header: "상태", cell: ({ row }) => <StatusBadge status={fixtureHealth(row.original.status)} label={fixtureStatusLabels[row.original.status]} /> },
  { id: "team", accessorFn: (fixture) => `${fixture.homeTeamId},${fixture.awayTeamId}`, filterFn: teamFilter, header: "구단 필터", cell: () => null, enableHiding: true },
  { id: "period", accessorFn: (fixture) => fixture.kickoffAt, filterFn: periodFilter, header: "기간 필터", cell: () => null, enableHiding: true },
  { accessorKey: "stadiumName", header: "경기장", cell: ({ row }) => <span className="block max-w-40 truncate text-muted-foreground">{row.original.stadiumName}</span> },
  { accessorKey: "round", header: ({ column }) => <DataTableColumnHeader column={column} title="라운드" />, cell: ({ row }) => <span className="tabular">{row.original.round === null ? "-" : `${row.original.round}R`}</span> },
  { accessorKey: "leagueId", header: "리그", cell: () => <span>K리그</span> },
  { accessorKey: "updatedAt", header: ({ column }) => <DataTableColumnHeader column={column} title="마지막 업데이트" />, cell: ({ row }) => <span className="tabular whitespace-nowrap text-muted-foreground">{formatRelativeTime(row.original.updatedAt)}</span> },
];

export function FixturesTable({ fixtures }: { fixtures: FixtureRecord[] }) {
  const teamOptions = Array.from(new Map(fixtures.flatMap((fixture) => [[fixture.homeTeamId, fixture.homeTeamName], [fixture.awayTeamId, fixture.awayTeamName]])))
    .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ko"));
  return (
    <DataTable
      columns={columns}
      data={fixtures}
      searchPlaceholder="구단 또는 경기장 검색"
      searchColumnId="fixture"
      filters={[
        { columnId: "period", label: "기간", options: [{ value: "today", label: "오늘" }, { value: "yesterday", label: "어제" }, { value: "tomorrow", label: "내일" }, { value: "last7", label: "최근 7일" }] },
        { columnId: "team", label: "구단", options: teamOptions },
        { columnId: "status", label: "상태", options: Object.entries(fixtureStatusLabels).map(([value, label]) => ({ value, label })) },
      ]}
      pageSize={25}
      hiddenColumns={["team", "period"]}
      emptyState="조건에 맞는 경기가 없습니다."
    />
  );
}

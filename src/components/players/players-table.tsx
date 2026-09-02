"use client";

import Link from "next/link";
import type { LegacyColumnDef, LegacyRow } from "@tanstack/react-table/legacy";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { StatusBadge } from "@/components/status-badge";
import { positionLabel } from "@/lib/football-labels";
import { formatRelativeTime } from "@/lib/format";
import type { PlayerRecord } from "@/lib/data/types";

const playerSearchFilter = (row: LegacyRow<PlayerRecord>, _columnId: string, value: unknown) => {
  const query = String(value).trim().toLocaleLowerCase("ko-KR");
  if (!query) return true;
  const player = row.original;
  return [player.name, player.displayName, player.koreanName, player.teamName, player.id]
    .filter(Boolean)
    .some((item) => String(item).toLocaleLowerCase("ko-KR").includes(query));
};

const columns: LegacyColumnDef<PlayerRecord>[] = [
  {
    id: "player",
    accessorFn: (player) => player.koreanName ?? player.displayName ?? player.name,
    filterFn: playerSearchFilter,
    header: ({ column }) => <DataTableColumnHeader column={column} title="선수" />,
    cell: ({ row }) => {
      const player = row.original;
      const displayName = player.koreanName ?? player.displayName ?? player.name;
      return (
        <Link href={`/squads/${player.id}`} className="group flex min-w-44 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5"><span className="truncate font-medium text-foreground group-hover:text-primary">{displayName}</span><ArrowUpRight className="size-3 text-muted-foreground/40" /></div>
            {player.name !== displayName ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{player.name}</p> : null}
          </div>
        </Link>
      );
    },
  },
  { accessorKey: "teamId", header: "소속 구단", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.teamName}</span> },
  { accessorKey: "shirtNumber", header: ({ column }) => <DataTableColumnHeader column={column} title="등번호" />, cell: ({ row }) => <span className="tabular font-mono">{row.original.shirtNumber ?? "-"}</span> },
  { accessorKey: "position", header: "포지션", cell: ({ row }) => <span className="whitespace-nowrap">{positionLabel(row.original.position)}</span> },
  { id: "nationality", header: "국적", enableSorting: false, cell: () => <span className="text-muted-foreground">확인 불가</span> },
  { accessorKey: "age", header: ({ column }) => <DataTableColumnHeader column={column} title="나이" />, cell: ({ row }) => <span className="tabular">{row.original.age === null ? "-" : `${row.original.age}세`}</span> },
  { accessorKey: "status", header: "상태", cell: ({ row }) => <StatusBadge status={row.original.status === "ACTIVE" ? "normal" : "unknown"} label={row.original.status === "ACTIVE" ? "활동" : "확인 필요"} /> },
  { accessorKey: "updatedAt", header: ({ column }) => <DataTableColumnHeader column={column} title="마지막 업데이트" />, cell: ({ row }) => <span className="tabular whitespace-nowrap text-muted-foreground">{formatRelativeTime(row.original.updatedAt)}</span> },
  { id: "override", header: "수동 수정", cell: ({ row }) => row.original.manualOverrideCount > 0 ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-primary"><LockKeyhole className="size-3" /> {row.original.manualOverrideCount}개 잠금</span> : <span className="text-[10px] text-muted-foreground">없음</span> },
];

export function PlayersTable({ players }: { players: PlayerRecord[] }) {
  const teamOptions = Array.from(new Map(players.map((player) => [player.teamId, player.teamName])))
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const positionOptions = Array.from(new Set(players.map((player) => player.position).filter((value): value is string => Boolean(value))))
    .map((value) => ({ value, label: positionLabel(value) }));

  return (
    <DataTable
      columns={columns}
      data={players}
      searchPlaceholder="선수명, 한글명, 구단 검색"
      searchColumnId="player"
      filters={[
        { columnId: "teamId", label: "구단", options: teamOptions },
        { columnId: "position", label: "포지션", options: positionOptions },
        { columnId: "status", label: "상태", options: [{ value: "ACTIVE", label: "활동" }, { value: "UNKNOWN", label: "확인 필요" }] },
      ]}
      pageSize={30}
      emptyState="조건에 맞는 선수가 없습니다."
    />
  );
}

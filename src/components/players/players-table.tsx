"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, UsersRound } from "lucide-react";
import type { LegacyColumnDef, LegacyRow } from "@tanstack/react-table/legacy";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { getTeamLogoPath } from "@/lib/data/catalog";
import { positionLabel } from "@/lib/football-labels";
import type { PlayerRecord } from "@/lib/data/types";

const playerSearchFilter = (row: LegacyRow<PlayerRecord>, _columnId: string, value: unknown) => {
  const query = String(value).trim().toLocaleLowerCase("ko-KR");
  if (!query) return true;
  const player = row.original;
  return [player.name, player.displayName, player.koreanName, player.teamName, player.id]
    .filter(Boolean)
    .some((item) => String(item).toLocaleLowerCase("ko-KR").includes(query));
};

const playerColumnWidths = {
  player: "w-[34%] pl-5",
  teamId: "w-[23%]",
  shirtNumber: "w-[12%]",
  position: "w-[17%]",
  age: "w-[14%]",
};

function positionDotClass(value: string) {
  const label = positionLabel(value);
  if (label === "골키퍼") return "bg-yellow-400";
  if (label === "수비수") return "bg-blue-500";
  if (label === "미드필더") return "bg-emerald-500";
  if (label === "공격수") return "bg-red-500";
  return "bg-muted-foreground/60";
}

const columns: LegacyColumnDef<PlayerRecord>[] = [
  {
    id: "player",
    accessorFn: (player) => player.koreanName ?? player.displayName ?? player.name,
    filterFn: playerSearchFilter,
    header: ({ column }) => <DataTableColumnHeader column={column} title="선수" className="ml-0 text-sm font-semibold text-foreground" />,
    cell: ({ row }) => {
      const player = row.original;
      const displayName = player.koreanName ?? player.displayName ?? player.name;
      return (
        <Link
          href={`/squads/detail/?playerId=${encodeURIComponent(player.id)}`}
          className="block min-w-44 max-w-80 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="truncate text-lg font-semibold text-foreground">{displayName}</p>
          {player.name !== displayName ? <p className="mt-1 truncate text-sm text-muted-foreground">{player.name}</p> : null}
        </Link>
      );
    },
  },
  { accessorKey: "teamId", header: "소속 구단", cell: ({ row }) => <span className="whitespace-nowrap font-medium">{row.original.teamName}</span> },
  { accessorKey: "shirtNumber", header: ({ column }) => <DataTableColumnHeader column={column} title="등번호" className="ml-0 w-full justify-center text-sm font-semibold text-foreground" />, cell: ({ row }) => <span className="tabular block text-center font-mono">{row.original.shirtNumber ?? "-"}</span> },
  { accessorKey: "position", header: "포지션", cell: ({ row }) => <span className="whitespace-nowrap">{positionLabel(row.original.position)}</span> },
  { accessorKey: "age", header: ({ column }) => <DataTableColumnHeader column={column} title="나이" className="text-sm font-semibold text-foreground" />, cell: ({ row }) => <span className="tabular">{row.original.age === null ? "-" : `${row.original.age}세`}</span> },
];

export function PlayersTable({ players }: { players: PlayerRecord[] }) {
  const teamOptions = Array.from(new Map(players.map((player) => [player.teamId, player.teamName])))
    .map(([value, label]) => {
      const logoPath = getTeamLogoPath(value);
      return {
        value,
        label,
        icon: logoPath ? <Image src={logoPath} width={20} height={20} alt="" className="size-5 object-contain" /> : undefined,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const positionOptions = Array.from(new Set(players.map((player) => player.position).filter((value): value is string => Boolean(value))))
    .map((value) => ({
      value,
      label: positionLabel(value),
      icon: <span className={`size-2 shrink-0 rounded-full ${positionDotClass(value)}`} aria-hidden="true" />,
    }));

  return (
    <DataTable
      columns={columns}
      data={players}
      headerTitle="선수 목록"
      headerTitleId="squad-list-title"
      showHeaderResultCount
      resetFiltersInHeader
      searchPlaceholder="선수명, 한글명, 구단 검색"
      searchColumnId="player"
      filters={[
        {
          columnId: "teamId",
          label: "구단",
          allLabel: "모든 구단",
          allIcon: (
            <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
              <UsersRound className="size-3" />
            </span>
          ),
          options: teamOptions,
        },
        {
          columnId: "position",
          label: "포지션",
          allLabel: "모든 포지션",
          allIcon: (
            <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
              <MapPin className="size-3" />
            </span>
          ),
          options: positionOptions,
        },
      ]}
      pageSize={30}
      emptyState="조건에 맞는 선수가 없습니다."
      getRowHref={(player) => `/squads/detail/?playerId=${encodeURIComponent(player.id)}`}
      comfortableToolbar
      alignFiltersEnd
      showResultCount={false}
      comfortableRows
      columnWidths={playerColumnWidths}
    />
  );
}

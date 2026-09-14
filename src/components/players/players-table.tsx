"use client";

import { playerHref, playerKey, SUPPORTED_LEAGUES } from "@/lib/football/config";
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

function PlayerMobileRow({ player }: { player: PlayerRecord }) {
  const displayName = player.koreanName ?? player.displayName ?? player.name;
  const teamLogoPath = getTeamLogoPath(player.teamId);

  return (
    <Link
      href={playerHref(player)}
      className="block p-4 outline-none hover:bg-primary/[0.06] focus-visible:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-foreground">{displayName}</span>
          {player.name !== displayName ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{player.name}</span> : null}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {player.shirtNumber === null ? "-" : `#${player.shirtNumber}`}
        </span>
      </span>
      <span className="mt-3 flex min-w-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-background/70">
            {teamLogoPath ? <Image src={teamLogoPath} fill sizes="24px" alt="" className="object-contain p-1" /> : <UsersRound className="size-3" aria-hidden="true" />}
          </span>
          <span className="truncate font-medium text-foreground">{player.teamName}</span>
        </span>
        <span className="shrink-0">
          {positionLabel(player.position)}{player.age === null ? "" : ` · ${player.age}세`}
        </span>
      </span>
    </Link>
  );
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
          href={playerHref(player)}
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

export function PlayersTable({ players, emptyState }: { players: PlayerRecord[]; emptyState?: string }) {
  const teamOptions = Array.from(new Map(players.map((player) => [player.teamId, {
    value: player.teamId,
    label: player.teamName,
    leagueId: player.leagueId,
  }])).values())
    .map((team) => {
      const logoPath = getTeamLogoPath(team.value);
      return {
        value: team.value,
        label: team.label,
        group: SUPPORTED_LEAGUES.find((league) => league.id === team.leagueId)?.label ?? "기타",
        icon: logoPath ? <Image src={logoPath} width={20} height={20} alt="" className="size-5 object-contain" /> : undefined,
      };
    })
    .sort((left, right) => {
      const leftIndex = SUPPORTED_LEAGUES.findIndex((league) => league.label === left.group);
      const rightIndex = SUPPORTED_LEAGUES.findIndex((league) => league.label === right.group);
      return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex)
        - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex)
        || left.label.localeCompare(right.label, "ko");
    });
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
      getRowId={playerKey}
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
      emptyState={players.length ? "조건에 맞는 선수가 없습니다." : emptyState ?? "등록된 데이터가 없습니다"}
      getRowHref={(player) => playerHref(player)}
      comfortableToolbar
      alignFiltersEnd
      showResultCount={false}
      comfortableRows
      columnWidths={playerColumnWidths}
      compactOnMobile
      renderMobileRow={(player) => <PlayerMobileRow player={player} />}
    />
  );
}

import Image from "next/image";
import { UsersRound } from "lucide-react";

import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { getTeamLogoPath, TEAM_IDS_BY_LEAGUE } from "@/lib/data/catalog";
import { isLeagueId, SUPPORTED_LEAGUES, type LeagueId } from "@/lib/football/config";
import { cn } from "@/lib/utils";

export type TeamSelectOption = {
  id: string;
  name: string;
  leagueId?: string | null;
};

type TeamSelectOptionsProps = {
  teams: TeamSelectOption[];
  itemClassName?: string;
};

function leagueForTeam(team: TeamSelectOption): LeagueId | null {
  if (isLeagueId(team.leagueId)) return team.leagueId;
  return SUPPORTED_LEAGUES.find((league) => (
    (TEAM_IDS_BY_LEAGUE[league.id] as readonly string[]).includes(team.id)
  ))?.id ?? null;
}

export function TeamSelectOptions({ teams, itemClassName }: TeamSelectOptionsProps) {
  const uniqueTeams = Array.from(new Map(teams.map((team) => [team.id, team])).values());
  const groups = SUPPORTED_LEAGUES.map((league) => ({
    id: league.id,
    label: league.label,
    teams: uniqueTeams
      .filter((team) => leagueForTeam(team) === league.id)
      .toSorted((left, right) => left.name.localeCompare(right.name, "ko")),
  })).filter((group) => group.teams.length > 0);
  const uncategorized = uniqueTeams
    .filter((team) => leagueForTeam(team) === null)
    .toSorted((left, right) => left.name.localeCompare(right.name, "ko"));
  const visibleGroups = uncategorized.length > 0
    ? [...groups, { id: "other", label: "기타", teams: uncategorized }]
    : groups;

  return visibleGroups.map((group, index) => (
    <SelectGroup key={group.id}>
      {index > 0 ? <SelectSeparator /> : null}
      <SelectLabel className="px-2.5 py-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">
        {group.label}
      </SelectLabel>
      {group.teams.map((team) => {
        const logoPath = getTeamLogoPath(team.id);
        return (
          <SelectItem
            key={team.id}
            value={team.id}
            className={cn("cursor-pointer py-2 pr-8 pl-2.5", itemClassName)}
          >
            {logoPath ? (
              <Image src={logoPath} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" />
            ) : (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
                <UsersRound className="size-3" />
              </span>
            )}
            <span className="truncate">{team.name}</span>
          </SelectItem>
        );
      })}
    </SelectGroup>
  ));
}

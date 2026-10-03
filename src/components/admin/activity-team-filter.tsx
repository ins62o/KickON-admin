"use client";

import { UsersRound } from "lucide-react";

import { TeamSelectOptions } from "@/components/admin/team-select-options";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTeamName, SUPPORTED_TEAM_IDS } from "@/lib/data/catalog";

const teams = SUPPORTED_TEAM_IDS.map((id) => ({ id, name: getTeamName(id) }));

export function ActivityTeamFilter({ teamId, label }: { teamId: string; label: string }) {
  return <Select key={teamId} name="team" defaultValue={teamId || "all"}>
    <SelectTrigger className="h-11! w-full sm:w-56" aria-label={label}><SelectValue /></SelectTrigger>
    <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) max-h-[min(20rem,var(--radix-select-content-available-height))]">
      <SelectItem value="all"><UsersRound className="size-5" aria-hidden="true" /><span>전체 팀</span></SelectItem>
      <TeamSelectOptions teams={teams} />
    </SelectContent>
  </Select>;
}

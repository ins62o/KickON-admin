import { cache } from "react";
import { formatKoreaDateTime } from "@/lib/format";
import { type LeagueFilter } from "@/lib/football/config";
import { getFixturesData, getStandingsData } from "./operations";

export type SyncControlOptionsData = {
  teams: Array<{ id: string; name: string; leagueId: string }>;
  fixtures: Array<{ id: string; label: string; leagueId: string }>;
  error: string | null;
};

export const getSyncControlOptions = cache(async (league: LeagueFilter = "all"): Promise<SyncControlOptionsData> => {
  const [teams, fixtures] = await Promise.all([getStandingsData(league), getFixturesData(league)]);
  return {
    teams: teams.data.map((team) => ({ id: team.teamId, name: team.teamName, leagueId: team.leagueId })),
    fixtures: fixtures.data.map((fixture) => ({
      id: fixture.id, leagueId: fixture.leagueId,
      label: `${formatKoreaDateTime(fixture.kickoffAt)} · ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
    })),
    error: teams.error ?? fixtures.error,
  };
});

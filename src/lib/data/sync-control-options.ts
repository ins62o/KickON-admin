import "server-only";

import { cache } from "react";

import { formatKoreaDateTime } from "@/lib/format";
import { getSupabaseConnection } from "./supabase";

type TeamOptionRow = {
  id: string;
  name: string;
};

type FixtureOptionRow = {
  id: string;
  kickoff_at: string;
  home_team_id: string;
  away_team_id: string;
};

export type SyncControlOptionsData = {
  teams: Array<{ id: string; name: string }>;
  fixtures: Array<{ id: string; label: string }>;
  error: string | null;
};

export const getSyncControlOptions = cache(async (): Promise<SyncControlOptionsData> => {
  const { client } = getSupabaseConnection();
  if (!client) {
    return {
      teams: [],
      fixtures: [],
      error: "Supabase 환경 변수가 설정되지 않았습니다.",
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const fixtureColumns = "id,kickoff_at,home_team_id,away_team_id";
  const [teamsResult, upcomingResult, recentResult] = await Promise.all([
    client.from("teams").select("id,name").order("name"),
    client
      .from("fixtures")
      .select(fixtureColumns)
      .eq("league_id", "kleague")
      .gte("kickoff_at", nowIso)
      .order("kickoff_at", { ascending: true })
      .limit(40),
    client
      .from("fixtures")
      .select(fixtureColumns)
      .eq("league_id", "kleague")
      .lt("kickoff_at", nowIso)
      .order("kickoff_at", { ascending: false })
      .limit(40),
  ]);

  const teams = (teamsResult.data ?? []) as TeamOptionRow[];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const fixtureRows = [
    ...((upcomingResult.data ?? []) as FixtureOptionRow[]),
    ...((recentResult.data ?? []) as FixtureOptionRow[]),
  ].sort((a, b) => (
    Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at)
    || a.id.localeCompare(b.id)
  ));

  const hasOptionsError = Boolean(
    teamsResult.error || upcomingResult.error || recentResult.error,
  );

  return {
    teams: teams.map((team) => ({ id: team.id, name: team.name })),
    fixtures: fixtureRows.map((fixture) => ({
      id: fixture.id,
      label: `${formatKoreaDateTime(fixture.kickoff_at)} · ${teamNames.get(fixture.home_team_id) ?? fixture.home_team_id} vs ${teamNames.get(fixture.away_team_id) ?? fixture.away_team_id}`,
    })),
    error: hasOptionsError ? "동기화 대상 목록 일부를 확인할 수 없습니다." : null,
  };
});

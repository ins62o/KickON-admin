import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { CURRENT_SEASON, SUPPORTED_LEAGUE_IDS } from "../src/lib/football/config.ts";
import { fetchAllRows } from "../src/lib/data/pagination.ts";

const env = Object.fromEntries(fs.readFileSync(".env.development.local", "utf8").split("\n")
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^[\"']|[\"']$/g, "")];
  }));
const client = createClient(
  env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);

const result = await fetchAllRows((from, to) => client.from("team_players")
  .select("season,league_id,team_id,player_id,player_name,display_name,display_name_ko,shirt_number,date_of_birth")
  .eq("season", CURRENT_SEASON).in("league_id", SUPPORTED_LEAGUE_IDS).eq("in_squad", true)
  .or("display_name_ko.is.null,shirt_number.is.null")
  .order("league_id").order("team_id").order("player_id").range(from, to));
if (result.error) throw new Error(result.error.message);
const teams = await client.from("teams").select("id,name,short_name").order("id");
if (teams.error) throw new Error(teams.error.message);
const teamById = new Map(teams.data.map((team) => [team.id, team]));
const missingNumberIds = result.data.filter((player) => player.shirt_number === null).map((player) => player.player_id);
const lineupNumbers = new Map();
for (let start = 0; start < missingNumberIds.length; start += 100) {
  const lineupResult = await fetchAllRows((from, to) => client.from("fixture_lineup_players")
    .select("player_id,team_id,shirt_number,fixture_id").in("player_id", missingNumberIds.slice(start, start + 100))
    .not("shirt_number", "is", null).order("player_id").order("fixture_id").range(from, to));
  if (lineupResult.error) throw new Error(lineupResult.error.message);
  for (const row of lineupResult.data) {
    const key = `${row.team_id}:${row.player_id}`;
    const values = lineupNumbers.get(key) ?? new Set();
    values.add(row.shirt_number);
    lineupNumbers.set(key, values);
  }
}
const grouped = Object.groupBy(result.data, (player) => `${player.league_id}:${player.team_id}`);
const report = Object.entries(grouped).map(([key, players]) => {
  const [, teamId] = key.split(":");
  return {
    leagueId: players[0].league_id,
    teamId,
    teamName: teamById.get(teamId)?.name ?? teamId,
    missingKoreanName: players.filter((player) => !player.display_name_ko),
    missingShirtNumber: players.filter((player) => player.shirt_number === null).map((player) => ({
      ...player,
      lineupShirtNumbers: [...(lineupNumbers.get(`${player.team_id}:${player.player_id}`) ?? [])],
    })),
  };
});
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  missingKoreanName: result.data.filter((player) => !player.display_name_ko).length,
  missingShirtNumber: result.data.filter((player) => player.shirt_number === null).length,
  teams: report,
}, null, 2));

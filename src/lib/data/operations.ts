import { cache } from "react";
import { getTeamLogoPath, getTeamName } from "./catalog";
import { getOperationsClient } from "./operations-client";
import { getSupabaseConnection } from "./supabase";
import type {
  DataFreshnessRecord,
  DataQueryResult,
  FixtureDetail,
  FixtureGoal,
  FixtureRecord,
  FixtureStatus,
  PlayerRankingRecord,
  PlayerRecord,
  StadiumRecord,
  StandingRecord,
} from "./types";

import { CURRENT_SEASON, leagueIds, seasonBounds, type LeagueFilter } from "@/lib/football/config";
import { fetchAllRows } from "./pagination";

type TeamPlayerRow = {
  season: number;
  league_id: string;
  team_id: string;
  player_id: string;
  player_name: string;
  display_name: string | null;
  display_name_ko: string | null;
  shirt_number: number | null;
  position: string | null;
  detailed_position: string | null;
  appearances: number;
  goals: number;
  assists: number;
  height: number | null;
  weight: number | null;
  date_of_birth: string | null;
  in_squad: boolean;
  updated_at: string;
};

type FixtureRow = {
  id: string;
  sportmonks_id: number | null;
  league_id: string;
  round: number | null;
  home_team_id: string;
  away_team_id: string;
  stadium_id: string;
  attendance_latitude: number | null;
  attendance_longitude: number | null;
  attendance_radius_meters: number;
  kickoff_at: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  live_minute: number | null;
  live_period: string | null;
  goal_events?: FixtureGoal[] | null;
  updated_at: string;
};

function ageFromBirthDate(value: string | null) {
  if (!value) return null;
  const birth = new Date(`${value}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function mapPlayer(row: TeamPlayerRow): PlayerRecord {
  return {
    id: row.player_id,
    season: row.season,
    leagueId: row.league_id,
    teamId: row.team_id,
    teamName: getTeamName(row.team_id),
    name: row.player_name,
    displayName: row.display_name,
    koreanName: row.display_name_ko,
    shirtNumber: row.shirt_number,
    position: row.position,
    detailedPosition: row.detailed_position,
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    height: row.height,
    weight: row.weight,
    dateOfBirth: row.date_of_birth,
    age: ageFromBirthDate(row.date_of_birth),
    inSquad: row.in_squad,
    status: row.in_squad ? "ACTIVE" : "UNKNOWN",
    updatedAt: row.updated_at,
    source: "SportsMonks",
    manualOverrideCount: 0,
  };
}

function noConnection<T>(data: T): DataQueryResult<T> {
  return { data, error: "Supabase 환경 변수가 설정되지 않았습니다.", connected: false };
}

const playerColumns = "season,league_id,team_id,player_id,player_name,display_name,display_name_ko,shirt_number,position,detailed_position,appearances,goals,assists,height,weight,date_of_birth,in_squad,updated_at";

export const getPlayersData = cache(async (league: LeagueFilter = "all", season = CURRENT_SEASON): Promise<DataQueryResult<PlayerRecord[]> & { total: number | null }> => {
  const { client } = getSupabaseConnection();
  if (!client) return { ...noConnection([]), total: null };
  const base = () => client.from("team_players").select(playerColumns)
    .eq("season", season).in("league_id", leagueIds(league)).eq("in_squad", true);
  const [result, count] = await Promise.all([
    fetchAllRows((from, to) => base().order("league_id").order("team_id").order("player_id").range(from, to)),
    client.from("team_players").select("player_id", { count: "exact", head: true })
      .eq("season", season).in("league_id", leagueIds(league)).eq("in_squad", true),
  ]);
  const rows = result.data as TeamPlayerRow[];
  const unique = new Set(rows.map((row) => `${row.season}:${row.league_id}:${row.player_id}`));
  const error = result.error?.message ?? count.error?.message
    ?? (unique.size !== rows.length || rows.length !== count.count ? "조회 중 선수 데이터가 변경되었습니다. 새로고침해 주세요." : null);
  return { data: error ? [] : rows.map(mapPlayer), total: count.error ? null : count.count, error, connected: !error };
});

export const getTeamPlayersData = cache(async (teamId: string, league: LeagueFilter = "all", season = CURRENT_SEASON): Promise<DataQueryResult<PlayerRecord[]>> => {
  const result = await getPlayersData(league, season);
  return { ...result, data: result.data.filter((player) => player.teamId === teamId) };
});

export const getPlayerData = cache(async (playerId: string, league: LeagueFilter = "all", season = CURRENT_SEASON): Promise<DataQueryResult<PlayerRecord | null>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection(null);
  // Legacy links may omit league. Resolve only when unique; never choose K1 implicitly.
  const result = await client.from("team_players").select(playerColumns)
    .eq("season", season).in("league_id", leagueIds(league)).eq("player_id", playerId).eq("in_squad", true).limit(2);
  const rows = (result.data ?? []) as TeamPlayerRow[];
  const error = result.error?.message ?? (rows.length > 1 ? "여러 리그에 등록된 선수입니다. 목록에서 리그를 선택해 주세요." : null);
  return { data: !error && rows[0] ? mapPlayer(rows[0]) : null, error, connected: !error };
});

export const getStadiumsData = cache(async (): Promise<DataQueryResult<StadiumRecord[]>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection([]);
  const result = await client.from("stadiums").select("id,name,name_ko,address,address_ko,latitude,longitude").order("name");
  return {
    data: (result.data ?? []).map((row) => ({
      id: row.id,
      name: row.name_ko ?? row.name,
      address: row.address_ko ?? row.address,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
    })),
    error: result.error?.message ?? null,
    connected: !result.error,
  };
});

async function getStadiumMap() {
  const result = await getStadiumsData();
  return new Map(result.data.map((stadium) => [stadium.id, stadium.name]));
}

function mapFixture(row: FixtureRow, stadiums: Map<string, string>): FixtureRecord {
  return {
    id: row.id,
    sportmonksId: row.sportmonks_id,
    leagueId: row.league_id,
    round: row.round,
    kickoffAt: row.kickoff_at,
    status: row.status,
    homeTeamId: row.home_team_id,
    homeTeamName: getTeamName(row.home_team_id),
    awayTeamId: row.away_team_id,
    awayTeamName: getTeamName(row.away_team_id),
    homeScore: row.home_score,
    awayScore: row.away_score,
    stadiumId: row.stadium_id,
    stadiumName: stadiums.get(row.stadium_id) ?? row.stadium_id,
    attendanceLatitude: row.attendance_latitude,
    attendanceLongitude: row.attendance_longitude,
    attendanceRadiusMeters: row.attendance_radius_meters,
    liveMinute: row.live_minute,
    livePeriod: row.live_period,
    updatedAt: row.updated_at,
    source: "SportsMonks",
  };
}

export const getFixturesData = cache(async (league: LeagueFilter = "all", season = CURRENT_SEASON): Promise<DataQueryResult<FixtureRecord[]>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection([]);
  const [result, stadiums] = await Promise.all([
    fetchAllRows((from, to) => client
      .from("fixtures")
      .select("id,sportmonks_id,league_id,round,home_team_id,away_team_id,stadium_id,attendance_latitude,attendance_longitude,attendance_radius_meters,kickoff_at,status,home_score,away_score,live_minute,live_period,updated_at")
      .in("league_id", leagueIds(league))
      .gte("kickoff_at", seasonBounds(season).start)
      .lt("kickoff_at", seasonBounds(season).end)
      .order("kickoff_at", { ascending: false })
      .order("id").range(from, to)),
    getStadiumMap(),
  ]);
  return {
    data: ((result.data ?? []) as FixtureRow[]).map((row) => mapFixture(row, stadiums)),
    error: result.error?.message ?? null,
    connected: !result.error,
  };
});

export const getFixtureData = cache(async (fixtureId: string, league: LeagueFilter = "all"): Promise<DataQueryResult<FixtureDetail | null>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection(null);
  const [fixtureResult, stadiums, lineupsResult, playersResult] = await Promise.all([
    client
      .from("fixtures")
      .select("id,sportmonks_id,league_id,round,home_team_id,away_team_id,stadium_id,attendance_latitude,attendance_longitude,attendance_radius_meters,kickoff_at,status,home_score,away_score,live_minute,live_period,goal_events,updated_at")
      .eq("id", fixtureId)
      .in("league_id", leagueIds(league))
      .maybeSingle(),
    getStadiumMap(),
    client.from("fixture_lineups").select("team_id,formation,coach_name").eq("fixture_id", fixtureId),
    client.from("fixture_lineup_players").select("player_id,team_id,player_name,display_name_ko,shirt_number,position,role,sort_order").eq("fixture_id", fixtureId).order("role").order("sort_order"),
  ]);
  if (fixtureResult.error || !fixtureResult.data) {
    return { data: null, error: fixtureResult.error?.message ?? null, connected: !fixtureResult.error };
  }
  const row = fixtureResult.data as FixtureRow;
  const base = mapFixture(row, stadiums);
  return {
    data: {
      ...base,
      goals: Array.isArray(row.goal_events) ? row.goal_events : [],
      lineups: (lineupsResult.data ?? []).map((item) => ({ teamId: item.team_id, formation: item.formation, coachName: item.coach_name })),
      lineupPlayers: (playersResult.data ?? []).map((item) => ({
        playerId: item.player_id,
        teamId: item.team_id,
        name: item.player_name,
        koreanName: item.display_name_ko,
        shirtNumber: item.shirt_number,
        position: item.position,
        role: item.role as "STARTER" | "SUBSTITUTE",
        sortOrder: item.sort_order,
      })),
    },
    error: lineupsResult.error?.message ?? playersResult.error?.message ?? null,
    connected: !lineupsResult.error && !playersResult.error,
  };
});

export const getStandingsData = cache(async (league: LeagueFilter = "all", season = CURRENT_SEASON): Promise<DataQueryResult<StandingRecord[]>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection([]);
  const result = await client
    .from("league_standings")
    .select("season,league_id,team_id,rank,played,won,drawn,lost,goals_for,goals_against,points,clean_sheets,average_possession,updated_at")
    .eq("season", season)
    .in("league_id", leagueIds(league))
    .order("league_id").order("rank").order("team_id");
  return {
    data: (result.data ?? []).map((row) => ({
      season: row.season,
      leagueId: row.league_id,
      teamId: row.team_id,
      teamName: getTeamName(row.team_id),
      logoPath: getTeamLogoPath(row.team_id),
      rank: row.rank,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goals_for,
      goalsAgainst: row.goals_against,
      goalDifference: row.goals_for - row.goals_against,
      points: row.points,
      cleanSheets: row.clean_sheets,
      averagePossession: row.average_possession == null ? null : Number(row.average_possession),
      updatedAt: row.updated_at,
    })),
    error: result.error?.message ?? null,
    connected: !result.error,
  };
});

export const getPlayerRankingsData = cache(async (league: LeagueFilter = "all"): Promise<DataQueryResult<PlayerRankingRecord[]>> => {
  const players = await getPlayersData(league);
  return {
    data: players.data.map((player) => ({
      season: player.season,
      leagueId: player.leagueId,
      playerId: player.id,
      playerName: player.name,
      koreanName: player.koreanName,
      teamId: player.teamId,
      teamName: player.teamName,
      goals: player.goals,
      assists: player.assists,
      appearances: player.appearances,
      updatedAt: player.updatedAt,
    })),
    error: players.error,
    connected: players.connected,
  };
});

function freshnessStatus(updatedAt: string | null, expectedMinutes: number | null) {
  if (!updatedAt || expectedMinutes === null) return "unknown" as const;
  const elapsed = (Date.now() - new Date(updatedAt).getTime()) / 60_000;
  if (elapsed <= expectedMinutes) return "normal" as const;
  if (elapsed <= expectedMinutes * 2) return "warning" as const;
  return "danger" as const;
}

export const getDataFreshness = cache(async (): Promise<DataQueryResult<DataFreshnessRecord[]>> => {
  const { client } = getSupabaseConnection();
  if (!client) return noConnection([]);
  const operationsClient = await getOperationsClient();
  const [players, fixtures, standings, scorers, liveFixtures, sync, transferSnapshots] = await Promise.all([
    client.from("team_players").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    client.from("fixtures").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    client.from("league_standings").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    client.from("player_scoring_stats").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    client.from("fixtures").select("id", { count: "exact", head: true }).eq("status", "LIVE"),
    client.from("football_sync_state").select("last_succeeded_at,last_error").order("last_attempted_at", { ascending: false }).limit(1),
    operationsClient
      ? operationsClient.from("player_squad_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: null, error: null }),
  ]);
  const fixtureExpected = (liveFixtures.count ?? 0) > 0 ? 5 : 1440;
  const rows: DataFreshnessRecord[] = [
    { key: "fixtures", label: "경기 데이터", lastUpdatedAt: fixtures.data?.[0]?.updated_at ?? null, expectedMinutes: fixtureExpected, status: freshnessStatus(fixtures.data?.[0]?.updated_at ?? null, fixtureExpected), source: "fixtures", detail: (liveFixtures.count ?? 0) > 0 ? "진행 중 경기 기준 5분" : "경기 없는 시간 기준 1일" },
    { key: "standings", label: "팀 순위", lastUpdatedAt: standings.data?.[0]?.updated_at ?? null, expectedMinutes: 30, status: freshnessStatus(standings.data?.[0]?.updated_at ?? null, 30), source: "league_standings", detail: "예상 갱신 주기 30분" },
    { key: "players", label: "선수 데이터", lastUpdatedAt: players.data?.[0]?.updated_at ?? null, expectedMinutes: 1440, status: freshnessStatus(players.data?.[0]?.updated_at ?? null, 1440), source: "team_players", detail: "예상 갱신 주기 1일" },
    { key: "rankings", label: "개인 순위", lastUpdatedAt: scorers.data?.[0]?.updated_at ?? null, expectedMinutes: 1440, status: freshnessStatus(scorers.data?.[0]?.updated_at ?? null, 1440), source: "player_scoring_stats", detail: "예상 갱신 주기 1일" },
    { key: "transfers", label: "이적/임대 데이터", lastUpdatedAt: transferSnapshots.data?.[0]?.captured_at ?? null, expectedMinutes: 1440, status: transferSnapshots.error ? "unknown" : freshnessStatus(transferSnapshots.data?.[0]?.captured_at ?? null, 1440), source: transferSnapshots.error ? "player_squad_snapshots · 연동 필요" : "player_squad_snapshots", detail: transferSnapshots.error ? "선수 변동 감지 마이그레이션이 필요합니다" : "선수단 스냅샷 예상 주기 1일" },
    { key: "sync", label: "동기화 작업", lastUpdatedAt: sync.data?.[0]?.last_succeeded_at ?? null, expectedMinutes: 60, status: sync.error ? "unknown" : freshnessStatus(sync.data?.[0]?.last_succeeded_at ?? null, 60), source: "football_sync_state", detail: sync.error ? "인증된 운영자 권한이 필요합니다" : "최근 작업 성공 시각" },
  ];
  const firstError = players.error || fixtures.error || standings.error || scorers.error;
  return { data: rows, error: firstError?.message ?? null, connected: !firstError };
});

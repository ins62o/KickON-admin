import { cache } from "react";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { getSupabaseConnection } from "./supabase";
import type { ClubSummary, DashboardData, HealthStatus, Metric, SyncState } from "./types";
import { getTeamLogoPath, getTeamName } from "./catalog";
import { getOperationsClient } from "./operations-client";

const CURRENT_LEAGUE_ID = "kleague";
const CURRENT_DIVISION: ClubSummary["division"] = "K리그1";

function startAndEndOfKoreaToday() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}

function syncLabel(key: string) {
  if (key.includes("live")) return "실시간 경기";
  if (key.includes("lineup")) return "선발 라인업";
  if (key.includes("post-match")) return "경기 종료 후 데이터";
  if (key.includes("history")) return "과거 시즌 데이터";
  if (key.includes("team")) return "구단 데이터";
  return key;
}

function syncHealth(lastSucceededAt: string | null, error: string | null): HealthStatus {
  if (error) return "danger";
  if (!lastSucceededAt) return "unknown";
  return (Date.now() - new Date(lastSucceededAt).getTime()) / 60_000 > 60 ? "warning" : "normal";
}

function freshnessHealth(updatedAt: string | null, expectedMinutes: number): HealthStatus {
  if (!updatedAt) return "unknown";
  const elapsedMinutes = (Date.now() - new Date(updatedAt).getTime()) / 60_000;
  if (elapsedMinutes <= expectedMinutes) return "normal";
  if (elapsedMinutes <= expectedMinutes * 2) return "warning";
  return "danger";
}

function combinedClubHealth(statuses: HealthStatus[], hasOperationalIssue: boolean): HealthStatus {
  if (statuses.every((status) => status === "unknown")) return "unknown";
  if (statuses.includes("danger")) return "danger";
  if (statuses.includes("warning") || statuses.includes("unknown") || hasOperationalIssue) return "warning";
  return "normal";
}

function unavailableMetrics(): Metric[] {
  return [
    "등록 구단 수", "등록 선수 수", "가입자 수", "오늘 경기 수", "진행 중 경기", "마지막 데이터 동기화",
    "동기화 실패", "최근 24시간 앱 오류", "미처리 사용자 제보", "SportsMonks 잔여량", "Supabase DB 사용량",
  ].map((label) => ({
    label,
    value: "연동 필요",
    detail: "환경 변수 또는 운영 데이터 계약이 필요합니다",
    status: "unknown" as const,
    availability: "unavailable" as const,
  }));
}

export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const { client, hasServiceRole, environment } = getSupabaseConnection();
  const generatedAt = new Date().toISOString();

  if (!client) {
    return {
      environment,
      generatedAt,
      connection: { status: "unavailable", message: "Supabase 환경 변수가 설정되지 않았습니다." },
      metrics: unavailableMetrics(),
      syncStates: [],
      clubs: [],
    };
  }

  const { start, end } = startAndEndOfKoreaToday();
  const operationsClientPromise = getOperationsClient();
  const reportsPromise = (async () => {
    const operationsClient = await operationsClientPromise;
    if (!operationsClient) return { data: null, error: null };
    return operationsClient.from("user_data_reports").select("entity_type,entity_id,status").in("status", ["open", "in_review", "on_hold"]).range(0, 1999);
  })();
  const changesPromise = (async () => {
    const operationsClient = await operationsClientPromise;
    if (!operationsClient) return { data: null, error: null };
    return operationsClient.from("player_change_events").select("from_team_id,to_team_id,review_status,detected_at").gte("detected_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).range(0, 1999);
  })();
  const [teamsResult, playerCountResult, todayFixturesResult, liveFixturesResult, standingsResult, playersResult, fixturesResult, syncResult, usageResult, reportsResult, changesResult] = await Promise.all([
    client.from("teams").select("id,name,short_name,code").order("name"),
    client.from("team_players").select("player_id", { count: "exact", head: true }).eq("league_id", CURRENT_LEAGUE_ID).eq("season", 2026).eq("in_squad", true),
    client.from("fixtures").select("id", { count: "exact", head: true }).eq("league_id", CURRENT_LEAGUE_ID).gte("kickoff_at", start).lte("kickoff_at", end),
    client.from("fixtures").select("id", { count: "exact", head: true }).eq("league_id", CURRENT_LEAGUE_ID).eq("status", "LIVE"),
    client.from("league_standings").select("team_id,rank,points,season,updated_at").eq("league_id", CURRENT_LEAGUE_ID).eq("season", 2026),
    client.from("team_players").select("player_id,team_id,updated_at").eq("league_id", CURRENT_LEAGUE_ID).eq("season", 2026).eq("in_squad", true),
    client.from("fixtures").select("id,home_team_id,away_team_id,kickoff_at,status,home_score,away_score,updated_at").eq("league_id", CURRENT_LEAGUE_ID).order("kickoff_at", { ascending: false }).limit(160),
    client.from("football_sync_state").select("sync_key,last_attempted_at,last_succeeded_at,last_error").order("last_attempted_at", { ascending: false }).limit(12),
    hasServiceRole
      ? client.from("football_provider_usage").select("remaining,observed_at,status_code,requested_entity").order("observed_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: null, error: null }),
    reportsPromise,
    changesPromise,
  ]);

  const coreError = teamsResult.error || playerCountResult.error || todayFixturesResult.error || liveFixturesResult.error;
  const teams = teamsResult.data ?? [];
  const standings = standingsResult.data ?? [];
  const players = playersResult.data ?? [];
  const fixtures = fixturesResult.data ?? [];
  const syncRows = syncResult.data ?? [];
  const latestSync = syncRows.find((row) => row.last_succeeded_at)?.last_succeeded_at ?? null;
  const failedSyncCount = syncResult.error ? null : syncRows.filter((row) => row.last_error).length;
  const latestUsage = usageResult.data?.[0] ?? null;
  const playerTeamById = new Map(players.map((player) => [player.player_id, player.team_id]));
  const reportCounts = new Map<string, number>();
  for (const report of reportsResult.data ?? []) {
    const teamId = report.entity_type === "team" ? report.entity_id : report.entity_type === "player" && report.entity_id ? playerTeamById.get(report.entity_id) : null;
    if (teamId) reportCounts.set(teamId, (reportCounts.get(teamId) ?? 0) + 1);
  }
  const changeCounts = new Map<string, number>();
  const latestChanges = new Map<string, string>();
  for (const change of changesResult.data ?? []) {
    const affectedTeams = new Set([change.from_team_id, change.to_team_id].filter((value): value is string => Boolean(value)));
    for (const teamId of affectedTeams) {
      changeCounts.set(teamId, (changeCounts.get(teamId) ?? 0) + 1);
      const latest = latestChanges.get(teamId);
      if (!latest || new Date(change.detected_at) > new Date(latest)) latestChanges.set(teamId, change.detected_at);
    }
  }

  const metrics: Metric[] = [
    {
      label: "등록 구단 수",
      value: formatNumber(teamsResult.error ? null : teams.length),
      detail: teamsResult.error ? "teams 조회 권한을 확인하세요" : "Supabase teams 기준",
      status: teamsResult.error ? "unknown" : "normal",
      availability: teamsResult.error ? "error" : "available",
    },
    {
      label: "등록 선수 수",
      value: formatNumber(playerCountResult.error ? null : playerCountResult.count ?? 0),
      detail: playerCountResult.error ? "team_players 조회 권한을 확인하세요" : "현재 선수단 등록 기준",
      status: playerCountResult.error ? "unknown" : "normal",
      availability: playerCountResult.error ? "error" : "available",
    },
    {
      label: "가입자 수", value: "연동 필요", detail: "관리자 가입자 집계 연결이 필요합니다",
      status: "unknown", availability: "unavailable",
    },
    {
      label: "오늘 경기 수",
      value: formatNumber(todayFixturesResult.error ? null : todayFixturesResult.count ?? 0),
      detail: "한국 시간 기준",
      status: todayFixturesResult.error ? "unknown" : "normal",
      availability: todayFixturesResult.error ? "error" : "available",
    },
    {
      label: "진행 중 경기",
      value: formatNumber(liveFixturesResult.error ? null : liveFixturesResult.count ?? 0),
      detail: liveFixturesResult.error ? "fixtures 조회 권한을 확인하세요" : "LIVE 상태 기준",
      status: liveFixturesResult.error ? "unknown" : (liveFixturesResult.count ?? 0) > 0 ? "warning" : "normal",
      availability: liveFixturesResult.error ? "error" : "available",
    },
    {
      label: "마지막 데이터 동기화",
      value: latestSync ? formatRelativeTime(latestSync) : "연동 필요",
      detail: syncResult.error ? "인증된 운영자 권한이 필요합니다" : "football_sync_state 기준",
      status: syncResult.error ? "unknown" : syncHealth(latestSync, null),
      availability: syncResult.error ? "unavailable" : "available",
    },
    {
      label: "동기화 실패",
      value: failedSyncCount === null ? "연동 필요" : `${failedSyncCount}건`,
      detail: syncResult.error ? "인증된 운영자 권한이 필요합니다" : "최근 동기화 상태 기준",
      status: failedSyncCount === null ? "unknown" : failedSyncCount > 0 ? "danger" : "normal",
      availability: failedSyncCount === null ? "unavailable" : "available",
    },
    {
      label: "최근 24시간 앱 오류", value: "연동 필요", detail: "오류 이벤트 스키마와 수집 SDK가 필요합니다",
      status: "unknown", availability: "unavailable",
    },
    {
      label: "미처리 사용자 제보", value: "연동 필요", detail: "user_reports 테이블이 필요합니다",
      status: "unknown", availability: "unavailable",
    },
    {
      label: "SportsMonks 잔여량",
      value: latestUsage?.remaining == null ? "연동 필요" : `${formatNumber(latestUsage.remaining)}회`,
      detail: hasServiceRole ? "최근 응답의 entity 잔여량" : "서버 전용 운영 권한이 필요합니다",
      status: latestUsage?.remaining == null ? "unknown" : latestUsage.remaining < 200 ? "danger" : "normal",
      availability: latestUsage?.remaining == null ? "unavailable" : "available",
    },
    {
      label: "Supabase DB 사용량", value: "연동 필요", detail: "Management API 연결이 필요합니다",
      status: "unknown", availability: "unavailable",
    },
  ];

  const syncStates: SyncState[] = syncRows.map((row) => ({
    key: row.sync_key,
    label: syncLabel(row.sync_key),
    attemptedAt: row.last_attempted_at,
    succeededAt: row.last_succeeded_at,
    error: row.last_error,
    status: syncHealth(row.last_succeeded_at, row.last_error),
  }));

  const now = Date.now();
  const clubs: ClubSummary[] = teams.map((team) => {
    const standing = standings.find((item) => item.team_id === team.id);
    const clubPlayers = players.filter((item) => item.team_id === team.id);
    const clubFixtures = fixtures.filter((item) => item.home_team_id === team.id || item.away_team_id === team.id);
    const recent = clubFixtures.find((item) => item.status === "FINISHED");
    const upcoming = [...clubFixtures]
      .filter((item) => item.status === "SCHEDULED" && new Date(item.kickoff_at).getTime() >= now)
      .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime())[0];
    const latestPlayerUpdate = clubPlayers.reduce<string | null>((latest, item) =>
      !latest || new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest, null);
    const latestFixtureUpdate = clubFixtures.reduce<string | null>((latest, item) =>
      !latest || new Date(item.updated_at) > new Date(latest) ? item.updated_at : latest, null);
    const playerStatus = freshnessHealth(latestPlayerUpdate, 1440);
    const fixtureStatus = freshnessHealth(latestFixtureUpdate, clubFixtures.some((fixture) => fixture.status === "LIVE") ? 5 : 1440);
    const standingStatus = freshnessHealth(standing?.updated_at ?? null, 30);
    const reportCount = reportsResult.error ? null : reportCounts.get(team.id) ?? 0;
    const changeCount = changesResult.error ? null : changeCounts.get(team.id) ?? 0;
    const hasOperationalIssue = (reportCount ?? 0) > 0 || (changeCount ?? 0) > 0;
    const hasCoreDataError = Boolean(standingsResult.error || fixturesResult.error || playersResult.error);

    return {
      id: team.id,
      name: getTeamName(team.id) === team.id ? team.name : getTeamName(team.id),
      shortName: team.short_name,
      code: team.code,
      logoPath: getTeamLogoPath(team.id),
      rank: standing?.rank ?? null,
      points: standing?.points ?? null,
      playerCount: playersResult.error ? null : clubPlayers.length,
      recentFixture: recent ? {
        homeTeam: getTeamName(recent.home_team_id),
        awayTeam: getTeamName(recent.away_team_id),
        homeScore: recent.home_score,
        awayScore: recent.away_score,
      } : null,
      nextFixture: upcoming ? {
        kickoffAt: upcoming.kickoff_at,
        opponent: getTeamName(upcoming.home_team_id === team.id ? upcoming.away_team_id : upcoming.home_team_id),
      } : null,
      playerUpdatedAt: latestPlayerUpdate,
      fixtureUpdatedAt: latestFixtureUpdate,
      standingUpdatedAt: standing?.updated_at ?? null,
      playerStatus,
      fixtureStatus,
      standingStatus,
      reportCount,
      changeCount,
      latestChangeAt: changesResult.error ? null : latestChanges.get(team.id) ?? null,
      division: standing || clubPlayers.length > 0 || clubFixtures.length > 0 ? CURRENT_DIVISION : null,
      status: hasCoreDataError ? "unknown" : combinedClubHealth([playerStatus, fixtureStatus, standingStatus], hasOperationalIssue),
    };
  });

  return {
    environment,
    generatedAt,
    connection: coreError
      ? { status: "error", message: coreError.message }
      : { status: "available", message: `${environment === "production" ? "운영" : "개발"} Supabase 연결됨` },
    metrics,
    syncStates,
    clubs,
  };
});

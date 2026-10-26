/** Season/provider mapping verified against football_provider_seasons. */
export const CURRENT_SEASON = 2026;
export const SUPPORTED_LEAGUES = [
  { id: "kleague", label: "K리그1", badge: "K1", providerLeagueId: 1034, seasons: { 2026: 26894 } },
  { id: "kleague2", label: "K리그2", badge: "K2", providerLeagueId: 1362, seasons: { 2026: 27443 } },
] as const;
export type LeagueId = typeof SUPPORTED_LEAGUES[number]["id"];
export type LeagueFilter = LeagueId | "all";
export const DEFAULT_LEAGUE_ID: LeagueId = SUPPORTED_LEAGUES[0].id;
export const SUPPORTED_LEAGUE_IDS = SUPPORTED_LEAGUES.map((league) => league.id);
export function isLeagueId(value: unknown): value is LeagueId {
  return SUPPORTED_LEAGUES.some((league) => league.id === value);
}
export function leagueIds(filter: LeagueFilter = "all") {
  return filter === "all" ? SUPPORTED_LEAGUE_IDS : [filter];
}
export function leagueLabel(value: string) {
  return value === "all" ? "전체" : SUPPORTED_LEAGUES.find((league) => league.id === value)?.label ?? value;
}
export function emptyLeagueMessage(value: LeagueFilter) {
  return value === "all" ? "등록된 데이터가 없습니다" : `등록된 ${leagueLabel(value)} 데이터가 없습니다`;
}
export function seasonBounds(season: number = CURRENT_SEASON) {
  return { start: `${season}-01-01T00:00:00+09:00`, end: `${season + 1}-01-01T00:00:00+09:00` };
}
export function playerKey(player: { season: number; leagueId: string; id: string }) {
  return `${player.season}:${player.leagueId}:${player.id}`;
}
export function playerHref(player: { season: number; leagueId: string; id: string }) {
  return `/squads/detail/?playerId=${encodeURIComponent(player.id)}&leagueId=${encodeURIComponent(player.leagueId)}&season=${player.season}` as const;
}
export function readFootballScope(form: FormData) {
  const leagueId = form.get("leagueId");
  const season = Number(form.get("season"));
  return isLeagueId(leagueId) && Number.isInteger(season) && season >= 2020 && season <= 2200 ? { leagueId, season } : null;
}

export function fixtureHref(fixture: { id: string; leagueId: string }) {
  return `/schedules/detail/?fixtureId=${encodeURIComponent(fixture.id)}&leagueId=${encodeURIComponent(fixture.leagueId)}`;
}

// 2026 competition rules: https://www.kleague.com/about/competition.do
export const STANDING_RULES = {
  kleague: "12팀 · 정규 33경기 후 상·하위 6팀 파이널 라운드. 김천 자동강등 및 최하위 팀 승강 PO는 대회요강을 따릅니다.",
  kleague2: "17팀 · 팀당 32경기. 1·2위 자동승격, 3~6위 플레이오프. 승격·강등 확정 여부는 최종 결과와 대회요강을 따릅니다.",
} as const;
export function standingStatus(leagueId: string, rank: number) {
  if (leagueId === "kleague") return rank <= 6 ? "상위 6위권" : "하위 6위권";
  if (leagueId === "kleague2") return rank <= 2 ? "자동승격 순위권" : rank <= 6 ? "플레이오프 순위권" : "정규리그";
  return "";
}

export type Availability = "available" | "unavailable" | "error";
export type HealthStatus = "normal" | "warning" | "danger" | "unknown";

export type Metric = {
  label: string;
  value: string;
  detail: string;
  status: HealthStatus;
  availability: Availability;
};

export type SyncState = {
  key: string;
  label: string;
  attemptedAt: string | null;
  succeededAt: string | null;
  error: string | null;
  status: HealthStatus;
};

export type ClubSummary = {
  leagueId: string | null;
  id: string;
  name: string;
  shortName: string;
  code: string;
  logoPath: string | null;
  rank: number | null;
  points: number | null;
  playerCount: number | null;
  recentFixture: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null } | null;
  nextFixture: { kickoffAt: string; opponent: string } | null;
  playerUpdatedAt: string | null;
  fixtureUpdatedAt: string | null;
  standingUpdatedAt: string | null;
  playerStatus: HealthStatus;
  fixtureStatus: HealthStatus;
  standingStatus: HealthStatus;
  reportCount: number | null;
  changeCount: number | null;
  latestChangeAt: string | null;
  division: "K리그1" | "K리그2" | null;
  status: HealthStatus;
};

export type DashboardData = {
  environment: "development" | "production";
  generatedAt: string;
  connection: { status: Availability; message: string };
  metrics: Metric[];
  syncStates: SyncState[];
  clubs: ClubSummary[];
};

import type { FixtureStatus, PlayerStatus } from "./catalog";

export type { FixtureStatus, PlayerStatus };

export type PlayerRecord = {
  id: string;
  season: number;
  leagueId: string;
  teamId: string;
  teamName: string;
  name: string;
  displayName: string | null;
  koreanName: string | null;
  shirtNumber: number | null;
  position: string | null;
  detailedPosition: string | null;
  appearances: number;
  goals: number;
  assists: number;
  height: number | null;
  weight: number | null;
  dateOfBirth: string | null;
  age: number | null;
  inSquad: boolean;
  status: PlayerStatus;
  updatedAt: string;
  source: "SportsMonks";
  manualOverrideCount: number;
};

export type FixtureRecord = {
  id: string;
  sportmonksId: number | null;
  leagueId: string;
  round: number | null;
  kickoffAt: string;
  status: FixtureStatus;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  stadiumId: string;
  stadiumName: string;
  attendanceLatitude: number | null;
  attendanceLongitude: number | null;
  attendanceRadiusMeters: number;
  liveMinute: number | null;
  livePeriod: string | null;
  updatedAt: string;
  source: "SportsMonks";
};

export type StadiumRecord = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export type FixtureGoal = {
  id?: string;
  teamId?: string;
  minute?: number;
  addedTime?: number;
  scorerName?: string;
  scorerNameKo?: string;
  assistName?: string;
  assistNameKo?: string;
  homeScore?: number;
  awayScore?: number;
  sortOrder?: number;
};

export type LineupPlayer = {
  playerId: string;
  teamId: string;
  name: string;
  koreanName: string | null;
  shirtNumber: number | null;
  position: string | null;
  role: "STARTER" | "SUBSTITUTE";
  sortOrder: number;
};

export type FixtureDetail = FixtureRecord & {
  goals: FixtureGoal[];
  lineups: Array<{ teamId: string; formation: string | null; coachName: string | null }>;
  lineupPlayers: LineupPlayer[];
};

export type StandingRecord = {
  season: number;
  leagueId: string;
  teamId: string;
  teamName: string;
  logoPath: string | null;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  cleanSheets: number;
  averagePossession: number | null;
  updatedAt: string;
};

export type PlayerRankingRecord = {
  season: number;
  leagueId: string;
  playerId: string;
  playerName: string;
  koreanName: string | null;
  teamId: string;
  teamName: string;
  goals: number;
  assists: number;
  appearances: number;
  updatedAt: string;
};

export type DataFreshnessRecord = {
  key: string;
  label: string;
  lastUpdatedAt: string | null;
  expectedMinutes: number | null;
  status: HealthStatus;
  source: string;
  detail: string;
};

export type DataQueryResult<T> = {
  data: T;
  error: string | null;
  connected: boolean;
};

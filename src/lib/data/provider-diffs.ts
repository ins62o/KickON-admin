import { cache } from "react";
import type { FixtureRecord, PlayerRecord, StandingRecord } from "./types";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type ComparableEntityType = "player" | "fixture" | "standing";

export type ProviderSnapshotRecord = {
  id: string;
  provider: string;
  entityType: string;
  entityId: string;
  providerEntityId: string | null;
  season: number | null;
  leagueId: string | null;
  sourceEndpoint: string | null;
  rawPayload: unknown;
  comparableValue: Record<string, unknown>;
  fetchedAt: string;
  requestId: string | null;
};

export type EntityOverrideRecord = {
  id: string;
  entityType: ComparableEntityType;
  entityId: string;
  fieldPath: string;
  originalValue: unknown;
  overrideValue: unknown;
  reason: string;
  createdAt: string;
  releasedAt: string | null;
};

export type FieldDiff = {
  field: string;
  label: string;
  databaseValue: unknown;
  providerValue: unknown;
  different: boolean;
  protectedByOverride: boolean;
};

const snapshotSelect = "id,provider,entity_type,entity_id,provider_entity_id,season,league_id,source_endpoint,raw_payload,comparable_value,fetched_at,request_id";
const fieldLabels: Record<ComparableEntityType, Record<string, string>> = {
  player: {
    team_id: "소속 구단", player_name: "선수명", display_name: "표시 이름", display_name_ko: "한글명",
    shirt_number: "등번호", position: "포지션", detailed_position: "세부 포지션", height: "신장",
    weight: "체중", date_of_birth: "생년월일", in_squad: "선수단 포함",
  },
  fixture: {
    round: "라운드", home_team_id: "홈팀", away_team_id: "원정팀", stadium_id: "경기장",
    kickoff_at: "경기 시각", status: "경기 상태", home_score: "홈 점수", away_score: "원정 점수",
  },
  standing: {
    rank: "순위", played: "경기", won: "승", drawn: "무", lost: "패", goals_for: "득점",
    goals_against: "실점", goal_difference: "득실차", points: "승점", clean_sheets: "클린시트",
    average_possession: "평균 점유율",
  },
};

function mapSnapshot(row: Record<string, unknown>): ProviderSnapshotRecord {
  return {
    id: String(row.id), provider: String(row.provider), entityType: String(row.entity_type), entityId: String(row.entity_id),
    providerEntityId: row.provider_entity_id ? String(row.provider_entity_id) : null,
    season: row.season === null || row.season === undefined ? null : Number(row.season),
    leagueId: row.league_id ? String(row.league_id) : null,
    sourceEndpoint: row.source_endpoint ? String(row.source_endpoint) : null,
    rawPayload: row.raw_payload,
    comparableValue: row.comparable_value as Record<string, unknown>,
    fetchedAt: String(row.fetched_at), requestId: row.request_id ? String(row.request_id) : null,
  };
}

function mapOverride(row: Record<string, unknown>): EntityOverrideRecord {
  return {
    id: String(row.id), entityType: row.entity_type as ComparableEntityType, entityId: String(row.entity_id),
    fieldPath: String(row.field_path), originalValue: row.original_value, overrideValue: row.override_value,
    reason: String(row.reason), createdAt: String(row.created_at), releasedAt: row.released_at ? String(row.released_at) : null,
  };
}

export const getEntityProviderOperations = cache(async (entityType: ComparableEntityType, entityId: string, season = 2026, leagueId = "kleague") => {
  const client = await getOperationsClient();
  if (!client) return { snapshot: null as ProviderSnapshotRecord | null, overrides: [] as EntityOverrideRecord[], schemaReady: false, error: "Supabase 환경 변수가 설정되지 않았습니다." };
  const [snapshot, overrides] = await Promise.all([
    client.from("provider_entity_snapshots").select(snapshotSelect).eq("entity_type", entityType).eq("entity_id", entityId).eq("season", season).eq("league_id", leagueId).order("fetched_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("manual_overrides").select("id,entity_type,entity_id,field_path,original_value,override_value,reason,created_at,released_at").eq("entity_type", entityType).eq("entity_id", entityId).eq("season", season).eq("league_id", leagueId).order("created_at", { ascending: false }).limit(100),
  ]);
  const error = snapshot.error ?? overrides.error;
  if (error) {
    const missing = isOperationsSchemaMissing(error.code);
    return { snapshot: null as ProviderSnapshotRecord | null, overrides: [] as EntityOverrideRecord[], schemaReady: !missing, error: missing ? "Provider Snapshot 마이그레이션 적용이 필요합니다." : "외부 비교 데이터를 조회할 수 없습니다." };
  }
  return {
    snapshot: snapshot.data ? mapSnapshot(snapshot.data) : null,
    overrides: (overrides.data ?? []).map((row) => mapOverride(row)),
    schemaReady: true,
    error: null,
  };
});

export const getProviderSnapshotIndex = cache(async (entityType: ComparableEntityType, entityIds: string[], season = 2026, leagueId = "kleague") => {
  const client = await getOperationsClient();
  if (!client || entityIds.length === 0) return { snapshots: new Map<string, ProviderSnapshotRecord>(), schemaReady: Boolean(client), error: client ? null : "Supabase 환경 변수가 설정되지 않았습니다." };
  const result = await client.from("provider_entity_snapshots").select(snapshotSelect).eq("entity_type", entityType).eq("season", season).eq("league_id", leagueId).in("entity_id", entityIds.slice(0, 200)).order("fetched_at", { ascending: false }).range(0, 999);
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { snapshots: new Map<string, ProviderSnapshotRecord>(), schemaReady: !missing, error: missing ? "Provider Snapshot 마이그레이션 적용이 필요합니다." : "외부 비교 데이터를 조회할 수 없습니다." };
  }
  const snapshots = new Map<string, ProviderSnapshotRecord>();
  for (const row of result.data ?? []) if (!snapshots.has(row.entity_id)) snapshots.set(row.entity_id, mapSnapshot(row));
  return { snapshots, schemaReady: true, error: null };
});

export const getProviderOverrideIndex = cache(async (entityType: ComparableEntityType, entityIds: string[], season = 2026, leagueId = "kleague") => {
  const client = await getOperationsClient();
  if (!client || entityIds.length === 0) return { overrides: new Map<string, EntityOverrideRecord[]>(), schemaReady: Boolean(client), error: client ? null : "Supabase 환경 변수가 설정되지 않았습니다." };
  const result = await client.from("manual_overrides")
    .select("id,entity_type,entity_id,field_path,original_value,override_value,reason,created_at,released_at")
    .eq("entity_type", entityType).eq("season", season).eq("league_id", leagueId)
    .in("entity_id", entityIds.slice(0, 200)).is("released_at", null).order("created_at", { ascending: false }).range(0, 999);
  if (result.error) {
    const missing = isOperationsSchemaMissing(result.error.code);
    return { overrides: new Map<string, EntityOverrideRecord[]>(), schemaReady: !missing, error: missing ? "Provider Snapshot 마이그레이션 적용이 필요합니다." : "수동 Override를 조회할 수 없습니다." };
  }
  const overrides = new Map<string, EntityOverrideRecord[]>();
  for (const row of result.data ?? []) {
    const item = mapOverride(row);
    overrides.set(item.entityId, [...(overrides.get(item.entityId) ?? []), item]);
  }
  return { overrides, schemaReady: true, error: null };
});

export function fixtureComparableValue(fixture: FixtureRecord): Record<string, unknown> {
  return {
    round: fixture.round,
    home_team_id: fixture.homeTeamId,
    away_team_id: fixture.awayTeamId,
    stadium_id: fixture.stadiumId,
    kickoff_at: fixture.kickoffAt,
    status: fixture.status,
    home_score: fixture.homeScore,
    away_score: fixture.awayScore,
  };
}

export function playerComparableValue(player: PlayerRecord): Record<string, unknown> {
  return {
    team_id: player.teamId,
    player_name: player.name,
    display_name: player.displayName,
    display_name_ko: player.koreanName,
    shirt_number: player.shirtNumber,
    position: player.position,
    detailed_position: player.detailedPosition,
    height: player.height,
    weight: player.weight,
    date_of_birth: player.dateOfBirth,
    in_squad: player.inSquad,
  };
}

export function standingComparableValue(standing: StandingRecord): Record<string, unknown> {
  return {
    rank: standing.rank, played: standing.played, won: standing.won, drawn: standing.drawn, lost: standing.lost,
    goals_for: standing.goalsFor, goals_against: standing.goalsAgainst, goal_difference: standing.goalDifference,
    points: standing.points, clean_sheets: standing.cleanSheets, average_possession: standing.averagePossession,
  };
}

function normalized(field: string, value: unknown) {
  if (field.endsWith("_at") && typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).getTime();
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(4)) : value;
  return value;
}

export function compareEntityValues(entityType: ComparableEntityType, currentValue: Record<string, unknown>, snapshot: ProviderSnapshotRecord | null, overrides: EntityOverrideRecord[] = []): FieldDiff[] {
  if (!snapshot) return [];
  const activeFields = new Set(overrides.filter((item) => !item.releasedAt).map((item) => item.fieldPath));
  return Object.entries(snapshot.comparableValue).filter(([field]) => field in fieldLabels[entityType]).map(([field, providerValue]) => {
    const databaseValue = currentValue[field];
    return {
      field,
      label: fieldLabels[entityType][field],
      databaseValue,
      providerValue,
      different: normalized(field, databaseValue) !== normalized(field, providerValue),
      protectedByOverride: activeFields.has(field),
    };
  });
}

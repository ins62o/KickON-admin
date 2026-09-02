export type SyncOperation = "full" | "live" | "post-match" | "history-backfill" | "team-squad" | "team-metrics" | "fixture-lineup";

export type SyncOperationDefinition = {
  key: SyncOperation;
  label: string;
  description: string;
  functionName: string;
  target: "none" | "team" | "fixture";
  requiresSecret: boolean;
  expectedCost: string;
};

export type SyncOperationLastSyncMap = Record<SyncOperation, {
  at: string | null;
  label: string;
}>;

export type SyncCoverage = {
  target: string;
  support: "direct" | "included" | "detected" | "missing";
  operation: string;
  detail: string;
};

export const syncOperations: SyncOperationDefinition[] = [
  {
    key: "team-squad",
    label: "구단 선수단",
    description: "선택한 구단의 현재 선수와 개인 기록을 다시 가져옵니다.",
    functionName: "sync-team-squad",
    target: "team",
    requiresSecret: false,
    expectedCost: "구단 1곳만 요청",
  },
  {
    key: "fixture-lineup",
    label: "경기 라인업",
    description: "선택한 경기의 선발·후보 명단을 다시 확인합니다.",
    functionName: "sync-fixture-lineup",
    target: "fixture",
    requiresSecret: false,
    expectedCost: "경기 1개만 요청",
  },
  {
    key: "team-metrics",
    label: "팀 순위 보조 지표",
    description: "클린시트와 평균 점유율 등 팀 시즌 지표를 갱신합니다.",
    functionName: "sync-team-metrics",
    target: "none",
    requiresSecret: false,
    expectedCost: "현재 시즌 전체 구단 대상",
  },
  {
    key: "live",
    label: "실시간 경기",
    description: "현재 경기 창의 스코어·이벤트·라인업을 즉시 확인합니다.",
    functionName: "sync-live-football",
    target: "none",
    requiresSecret: true,
    expectedCost: "활성 경기 수에 따라 변동",
  },
  {
    key: "full",
    label: "2026 전체 데이터",
    description: "구단·경기·순위·선수·개인 순위를 전체 재동기화합니다.",
    functionName: "sync-football-data",
    target: "none",
    requiresSecret: true,
    expectedCost: "사용량 큼 · 외부 데이터를 여러 번 요청",
  },
  {
    key: "post-match",
    label: "종료 경기·순위 보강",
    description: "종료된 경기 기록과 시즌 순위·개인 기록을 다시 확인합니다.",
    functionName: "sync-football-data",
    target: "none",
    requiresSecret: true,
    expectedCost: "사용량 큼 · 시즌 기록과 종료 경기를 다시 확인",
  },
  {
    key: "history-backfill",
    label: "통합 시즌 데이터",
    description: "준비되지 않은 과거 시즌을 순서대로 적재하고 득점 이벤트를 보강합니다.",
    functionName: "sync-football-data",
    target: "none",
    requiresSecret: true,
    expectedCost: "사용량 매우 큼 · 준비된 시즌은 건너뜀",
  },
];

export const cronSyncOperation: Record<string, SyncOperation | null> = {
  "kickon-live-football-sync": "live",
  "kickon-team-squad-refresh": "team-squad",
  "kickon-team-metrics-reconciliation": "team-metrics",
  "kickon-post-match-football-sync": "post-match",
  "kickon-initial-football-history-backfill": "history-backfill",
  "kickon-football-provider-usage-retention": null,
  "kickon-fixture-cheer-retention": null,
};

export const syncCoverage: SyncCoverage[] = [
  { target: "전체 데이터", support: "direct", operation: "sync-football-data", detail: "구단·경기·순위·선수·개인 기록을 2026 시즌 단위로 갱신" },
  { target: "구단", support: "direct", operation: "sync-team-squad", detail: "선택 구단 선수단과 득점·도움·출전 기록 갱신" },
  { target: "선수", support: "included", operation: "sync-team-squad", detail: "선수 단건 API가 없어 현재 소속 구단 선수단 단위로 갱신" },
  { target: "경기", support: "direct", operation: "sync-fixture-lineup", detail: "선택 경기의 확정 라인업·후보 명단 갱신" },
  { target: "팀 순위", support: "included", operation: "sync-football-data / sync-team-metrics", detail: "기본 순위는 전체 동기화, 클린시트·점유율은 보조 지표 작업에 포함" },
  { target: "개인 순위", support: "included", operation: "sync-football-data / sync-team-squad", detail: "전체 시즌 또는 선택 구단 선수단 갱신에 포함" },
  { target: "이적/임대", support: "detected", operation: "sync-team-squad", detail: "구단 선수단을 새로고침하기 전과 후의 차이로 이동 후보 확인" },
];

export function getSyncOperation(value: string) {
  return syncOperations.find((operation) => operation.key === value) ?? null;
}

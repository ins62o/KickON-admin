import { cronMaintenanceJobs, isCronMaintenanceJobKey } from "../cron/catalog";
import { cronSyncOperation, getSyncOperation, syncOperations, type SyncOperationDefinition } from "./catalog";

export type SyncRunDiagnosis = {
  tone: "normal" | "warning" | "danger";
  operationLabel: string;
  title: string;
  summary: string;
  checks: string[];
  retryHref: string | null;
  retryLabel: string;
  relatedHref: string | null;
  relatedLabel: string | null;
  environmentMismatch: boolean;
};

type DiagnosisInput = {
  run: SyncDiagnosisRun;
  items: SyncDiagnosisItem[];
  currentEnvironment: "development" | "production";
};

type SyncDiagnosisRun = {
  jobKey: string;
  targetType: string | null;
  targetId: string | null;
  environment: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: unknown;
};

type SyncDiagnosisItem = {
  status: string;
  operation: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export function diagnoseSyncRun({ run, items, currentEnvironment }: DiagnosisInput): SyncRunDiagnosis {
  const operation = resolveOperation(run);
  const maintenance = isCronMaintenanceJobKey(run.jobKey) ? cronMaintenanceJobs[run.jobKey] : null;
  const operationLabel = operation?.label ?? maintenance?.label ?? "기타 데이터 작업";
  const failedItem = items.find((item) => item.status === "failed" || item.operation === "fail");
  const errorCode = run.errorCode ?? failedItem?.errorCode ?? null;
  const errorMessage = run.errorMessage ?? failedItem?.errorMessage ?? null;
  const evidence = `${errorCode ?? ""} ${errorMessage ?? ""}`.toLowerCase();
  const metadataStatus = metadataText(run.metadata, "status").toLowerCase();
  const environmentMismatch = run.environment !== currentEnvironment;
  const related = syncEntityLink(run.targetType, run.targetId);
  const canRetry = !environmentMismatch && run.status !== "running" && run.status !== "queued";
  const retryHref = canRetry
    ? maintenance
      ? "/cron"
      : operation
        ? operationRetryHref(operation, run)
        : null
    : null;

  const base = {
    operationLabel,
    retryHref,
    retryLabel: maintenance ? "자동 작업에서 다시 확인" : `${operationLabel} 다시 실행`,
    relatedHref: related?.href ?? null,
    relatedLabel: related?.label ?? null,
    environmentMismatch,
  };

  if (run.status === "succeeded" && !errorCode && !errorMessage) {
    return {
      ...base,
      tone: "normal",
      title: "정상적으로 마무리된 실행입니다",
      summary: "실패한 대상이나 오류 메시지 없이 모두 반영됐습니다.",
      checks: environmentCheck(environmentMismatch, run.environment, currentEnvironment),
    };
  }

  if (run.status === "running" || run.status === "queued") {
    return {
      ...base,
      tone: "warning",
      title: run.status === "running" ? "아직 실행 중이거나 종료 기록이 남지 않았습니다" : "작업이 대기 상태입니다",
      summary: "중복 실행을 피하기 위해 재실행 경로를 제공하지 않습니다.",
      checks: [
        "자동 작업 화면에서 같은 작업이 진행 중인지 먼저 확인하세요.",
        "실제 작업이 끝났는데 계속 실행 중으로 보이면 개발 담당자에게 실행 기록 확인을 요청하세요.",
        ...environmentCheck(environmentMismatch, run.environment, currentEnvironment),
      ],
    };
  }

  if (run.status === "partial" || metadataStatus === "pending" || metadataStatus === "already-running") {
    return {
      ...base,
      tone: "warning",
      title: "새로고침이 대기 또는 일부 완료 상태입니다",
      summary: "같은 작업이 이미 실행 중이거나 잠시 기다려야 해서 일부 데이터만 반영됐을 수 있습니다.",
      checks: [
        "자동 작업 화면에서 같은 작업이 실행 중인지 확인하세요.",
        "최신 데이터 시각을 확인한 뒤 아직 느리면 해당 대상만 다시 실행하세요.",
        ...environmentCheck(environmentMismatch, run.environment, currentEnvironment),
      ],
    };
  }

  const classified = classifyFailure(evidence);
  return {
    ...base,
    tone: run.status === "failed" ? "danger" : "warning",
    title: classified.title,
    summary: errorCode || errorMessage
      ? `기록된 오류 코드·메시지를 기준으로 ${classified.summary}`
      : "실패 상태이지만 오류 코드와 메시지가 기록되지 않았습니다.",
    checks: [
      ...classified.checks,
      ...environmentCheck(environmentMismatch, run.environment, currentEnvironment),
    ],
  };
}

export function syncEntityLink(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId || entityId.length > 200) return null;
  const normalizedType = entityType.toLowerCase();
  const definition = ({
    team: { prefix: "/clubs/", label: "관련 구단 열기" },
    club: { prefix: "/clubs/", label: "관련 구단 열기" },
    player: { prefix: "/players/", label: "관련 선수 열기" },
    fixture: { prefix: "/fixtures/", label: "관련 경기 열기" },
    standing: { prefix: "/standings/", label: "관련 순위 열기" },
    ranking: { prefix: "/players/", label: "관련 선수 열기" },
  } as Record<string, { prefix: string; label: string }>)[normalizedType];
  return definition ? { href: `${definition.prefix}${encodeURIComponent(entityId)}`, label: definition.label } : null;
}

function resolveOperation(run: SyncDiagnosisRun) {
  const metadataOperation = metadataText(run.metadata, "operationKey");
  const declared = getSyncOperation(metadataOperation);
  if (declared && declared.functionName === run.jobKey) return declared;

  const cronOperation = cronSyncOperation[run.jobKey];
  if (cronOperation) return getSyncOperation(cronOperation);

  const keyOperation = getSyncOperation(run.jobKey);
  if (keyOperation) return keyOperation;

  const matchingFunctions = syncOperations.filter((operation) => operation.functionName === run.jobKey);
  return matchingFunctions.length === 1 ? matchingFunctions[0] : null;
}

function operationRetryHref(operation: SyncOperationDefinition, run: SyncDiagnosisRun) {
  const params = new URLSearchParams({ operation: operation.key });
  if (operation.target === "team") {
    if (run.targetType !== "team" || !run.targetId) return null;
    params.set("teamId", run.targetId);
  }
  if (operation.target === "fixture") {
    if (run.targetType !== "fixture" || !run.targetId) return null;
    params.set("fixtureId", run.targetId);
  }
  return `/sync?${params.toString()}`;
}

function metadataText(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item.trim() : "";
}

function environmentCheck(mismatch: boolean, runEnvironment: string, currentEnvironment: string) {
  return mismatch
    ? [`이 기록은 ${environmentLabel(runEnvironment)} 환경이지만 현재 콘솔은 ${environmentLabel(currentEnvironment)} 환경에 연결되어 자동 재실행 경로를 제공하지 않습니다.`]
    : [];
}

function environmentLabel(value: string) {
  return value === "production" ? "운영" : value === "development" ? "개발" : value;
}

function classifyFailure(evidence: string) {
  if (/football_sync_secret|not configured|환경 변수|설정이 필요|missing secret/.test(evidence)) {
    return {
      title: "서버 설정을 먼저 확인해야 합니다",
      summary: "서버의 필수 연결 설정이 빠졌을 가능성이 있습니다.",
      checks: ["같은 작업을 반복 실행하지 말고 개발 담당자에게 서버 연결 설정 확인을 요청하세요.", "설정이 복구된 뒤 필요한 대상만 다시 실행하세요."],
    };
  }
  if (/unauthori[sz]ed|forbidden|jwt|authentication|permission|401|403|권한|인증/.test(evidence)) {
    return {
      title: "인증 또는 권한 경로를 확인해야 합니다",
      summary: "관리자 권한 또는 서버의 데이터 접근 권한이 거부됐을 가능성이 있습니다.",
      checks: ["요청한 관리자가 운영자 이상의 활성 계정인지 확인하세요.", "계정이 정상이라면 개발 담당자에게 서버 권한 기록 확인을 요청하세요."],
    };
  }
  if (/rate.?limit|too many requests|429|쿼터|호출량/.test(evidence)) {
    return {
      title: "외부 데이터 사용량을 확인해야 합니다",
      summary: "외부 데이터 요청 한도에 도달했을 가능성이 있습니다.",
      checks: ["외부 데이터 사용량 화면에서 남은 요청 수와 최근 실패를 확인하세요.", "한도가 회복되기 전에는 전체 새로고침 대신 필요한 구단이나 경기만 실행하세요."],
    };
  }
  if (/timeout|timed out|abort|network|fetch failed|econn|타임아웃|네트워크/.test(evidence)) {
    return {
      title: "외부 연결 지연을 확인해야 합니다",
      summary: "외부 데이터 또는 처리 서버가 제시간에 응답하지 못했을 가능성이 있습니다.",
      checks: ["시스템 상태에서 외부 연결과 처리 서버가 정상인지 확인하세요.", "같은 자동 작업이 진행 중이 아닌지 확인한 뒤 범위를 줄여 한 번만 다시 시도하세요."],
    };
  }
  if (/pgrst|relation|column|constraint|duplicate key|database|supabase|rpc|schema|42p|23\d{3}|db /.test(evidence)) {
    return {
      title: "데이터 저장소 설정을 확인해야 합니다",
      summary: "데이터 구조 또는 저장 권한이 현재 서버와 맞지 않을 가능성이 있습니다.",
      checks: ["재실행하지 말고 개발 담당자에게 데이터 저장소 변경 사항 확인을 요청하세요.", "오류 로그의 데이터베이스 코드를 함께 전달하면 원인을 더 빨리 찾을 수 있습니다."],
    };
  }
  if (/mapping|external.?id|not found|unknown team|unknown player|parse|unexpected null|매핑|파싱|미존재|null/.test(evidence)) {
    return {
      title: "외부 데이터와 킥온 데이터의 연결을 확인해야 합니다",
      summary: "구단·선수·경기의 외부 식별값이 없거나 응답 형식이 예상과 다를 가능성이 있습니다.",
      checks: ["관련 구단·선수·경기의 외부 데이터 식별값과 최근 원본을 비교하세요.", "연결 정보를 바로잡은 뒤 해당 대상만 다시 실행하세요."],
    };
  }
  if (/http 5\d\d|provider_api_error|bad gateway|service unavailable|502|503|504/.test(evidence)) {
    return {
      title: "외부 데이터 또는 처리 서버 상태를 확인해야 합니다",
      summary: "외부 서비스나 처리 서버에서 일시적인 장애 응답을 보냈을 가능성이 있습니다.",
      checks: ["시스템 상태와 외부 데이터 사용량의 최근 실패를 함께 확인하세요.", "상태가 회복된 뒤 같은 대상으로 한 번만 다시 시도하세요."],
    };
  }
  return {
    title: "오류 로그와 대상별 실패를 확인해야 합니다",
    summary: "특정 원인을 안전하게 단정할 수 없어 일반 조사 순서를 제안합니다.",
    checks: ["오류 메시지와 대상별 처리 기록, 같은 시각의 오류 로그를 함께 확인하세요.", "원인을 확인하기 전에는 전체 새로고침을 반복 실행하지 마세요."],
  };
}

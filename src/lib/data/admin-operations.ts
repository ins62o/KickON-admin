import "server-only";

import { cache } from "react";
import { auditActionLabel } from "./audit";
import { getOperationsClient, isOperationsSchemaMissing } from "./operations-client";

export type OperationSection = "reports" | "errors" | "sync-history" | "audit";

export type OperationColumn = {
  key: string;
  label: string;
  kind?: "text" | "mono" | "status" | "number" | "time";
};

export type OperationDataset = {
  section: OperationSection;
  title: string;
  description: string;
  source: string;
  columns: OperationColumn[];
  rows: Array<Record<string, string | number | null>>;
  total: number | null;
  schemaReady: boolean;
  error: string | null;
};

const sectionMeta: Record<OperationSection, Pick<OperationDataset, "title" | "description" | "source" | "columns">> = {
  reports: {
    title: "사용자 데이터 제보",
    description: "사용자가 접수한 데이터 수정 요청을 검토하고 처리합니다.",
    source: "user_data_reports",
    columns: [
      { key: "entity", label: "대상" },
      { key: "field", label: "필드", kind: "mono" },
      { key: "priority", label: "우선순위", kind: "status" },
      { key: "status", label: "상태", kind: "status" },
      { key: "assignee", label: "담당자", kind: "mono" },
      { key: "createdAt", label: "접수 시각", kind: "time" },
    ],
  },
  errors: {
    title: "오류 로그",
    description: "앱과 백엔드 오류를 Fingerprint 단위로 묶어 확인합니다.",
    source: "error_groups",
    columns: [
      { key: "title", label: "오류" },
      { key: "source", label: "소스", kind: "mono" },
      { key: "severity", label: "심각도", kind: "status" },
      { key: "count", label: "이벤트", kind: "number" },
      { key: "status", label: "상태", kind: "status" },
      { key: "lastSeenAt", label: "마지막 발생", kind: "time" },
    ],
  },
  "sync-history": {
    title: "동기화 기록",
    description: "자동·수동 동기화의 실행 결과와 처리 건수를 확인합니다.",
    source: "sync_runs",
    columns: [
      { key: "job", label: "작업", kind: "mono" },
      { key: "target", label: "대상" },
      { key: "environment", label: "환경", kind: "status" },
      { key: "trigger", label: "실행 방식", kind: "status" },
      { key: "status", label: "상태", kind: "status" },
      { key: "startedAt", label: "시작 시각", kind: "time" },
      { key: "duration", label: "소요 시간", kind: "number" },
      { key: "providerCalls", label: "API 호출", kind: "number" },
      { key: "changed", label: "처리 결과", kind: "number" },
    ],
  },
  audit: {
    title: "관리자 변경 기록",
    description: "운영자의 권한 변경과 수동 보정 이력을 추적합니다.",
    source: "admin_audit_logs",
    columns: [
      { key: "actor", label: "작업자", kind: "mono" },
      { key: "action", label: "작업", kind: "status" },
      { key: "entity", label: "대상" },
      { key: "reason", label: "사유" },
      { key: "createdAt", label: "작업 시각", kind: "time" },
    ],
  },
};

function unavailable(section: OperationSection, error: string, schemaReady = false): OperationDataset {
  return { section, ...sectionMeta[section], rows: [], total: null, schemaReady, error };
}

export const getOperationDataset = cache(async (section: OperationSection): Promise<OperationDataset> => {
  const client = await getOperationsClient();
  if (!client) return unavailable(section, "Supabase 환경 변수가 설정되지 않았습니다.");

  if (section === "reports") {
    const result = await client
      .from("user_data_reports")
      .select("id,entity_type,entity_id,field_path,priority,status,assignee_id,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, 199);
    if (result.error) return unavailable(section, isOperationsSchemaMissing(result.error.code) ? "운영 스키마 마이그레이션 적용이 필요합니다." : "제보 데이터를 조회할 수 없습니다.", !isOperationsSchemaMissing(result.error.code));
    return {
      section, ...sectionMeta[section], schemaReady: true, error: null, total: result.count,
      rows: (result.data ?? []).map((row) => ({
        id: row.id,
        href: `/reports/${row.id}`,
        entity: `${row.entity_type}${row.entity_id ? ` · ${row.entity_id}` : ""}`,
        field: row.field_path,
        priority: ({ low: "낮음", normal: "보통", high: "높음", urgent: "긴급" } as Record<string, string>)[row.priority] ?? row.priority,
        status: ({ open: "신규", in_review: "확인 중", resolved: "수정 완료", rejected: "정상 데이터", on_hold: "보류" } as Record<string, string>)[row.status] ?? row.status,
        assignee: row.assignee_id,
        createdAt: row.created_at,
      })),
    };
  }

  if (section === "errors") {
    const result = await client
      .from("error_groups")
      .select("id,title,source,severity,status,event_count,last_seen_at", { count: "exact" })
      .order("last_seen_at", { ascending: false })
      .range(0, 199);
    if (result.error) return unavailable(section, isOperationsSchemaMissing(result.error.code) ? "운영 스키마 마이그레이션 적용과 오류 수집기 연동이 필요합니다." : "오류 그룹을 조회할 수 없습니다.", !isOperationsSchemaMissing(result.error.code));
    return {
      section, ...sectionMeta[section], schemaReady: true, error: null, total: result.count,
      rows: (result.data ?? []).map((row) => ({
        id: row.id,
        href: `/errors/${row.id}`,
        title: row.title,
        source: row.source,
        severity: ({ info: "정보", warning: "주의", error: "오류", fatal: "치명적 오류" } as Record<string, string>)[row.severity] ?? row.severity,
        count: row.event_count,
        status: ({ open: "미해결", investigating: "조사 중", resolved: "해결", ignored: "무시" } as Record<string, string>)[row.status] ?? row.status,
        lastSeenAt: row.last_seen_at,
      })),
    };
  }

  if (section === "sync-history") {
    const result = await client
      .from("sync_runs")
      .select("id,job_key,target_type,target_id,trigger_type,environment,status,started_at,finished_at,provider_request_count,inserted_count,updated_count,failed_count,metadata,created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, 199);
    if (result.error) return unavailable(section, isOperationsSchemaMissing(result.error.code) ? "운영 스키마 마이그레이션과 Edge Function 기록 연동이 필요합니다." : "동기화 기록을 조회할 수 없습니다.", !isOperationsSchemaMissing(result.error.code));
    return {
      section, ...sectionMeta[section], schemaReady: true, error: null, total: result.count,
      rows: (result.data ?? []).map((row) => {
        const deletedCount = deletedCountFromMetadata(row.metadata);
        return {
          id: row.id,
          href: `/sync-history/${row.id}`,
          job: row.job_key,
          target: row.target_type ? `${row.target_type}${row.target_id ? ` · ${row.target_id}` : ""}` : "전체",
          environment: row.environment === "production" ? "운영" : "개발",
          trigger: ({ cron: "자동 크론", manual: "관리자 수동", webhook: "Webhook", retry: "재시도", system: "시스템 자동" } as Record<string, string>)[row.trigger_type] ?? row.trigger_type,
          status: ({ queued: "대기", running: "실행 중", succeeded: "정상", partial: "일부 완료", failed: "실패", cancelled: "취소" } as Record<string, string>)[row.status] ?? row.status,
          startedAt: row.started_at ?? row.created_at,
          duration: row.started_at && row.finished_at ? `${Math.max(0, (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000).toFixed(1)}초` : null,
          providerCalls: row.provider_request_count === null ? null : `${row.provider_request_count}회`,
          changed: deletedCount !== null
            ? `삭제 ${deletedCount}건`
            : [row.inserted_count, row.updated_count, row.failed_count].every((value) => value === null)
              ? null
              : `추가 ${row.inserted_count ?? "?"} / 수정 ${row.updated_count ?? "?"} / 실패 ${row.failed_count ?? "?"}`,
        };
      }),
    };
  }

  const result = await client
    .from("admin_audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,reason,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(0, 199);
  if (result.error) return unavailable(section, isOperationsSchemaMissing(result.error.code) ? "운영 스키마 마이그레이션 적용이 필요합니다." : "감사 로그를 조회할 수 없습니다.", !isOperationsSchemaMissing(result.error.code));
  return {
    section, ...sectionMeta[section], schemaReady: true, error: null, total: result.count,
    rows: (result.data ?? []).map((row) => ({
      id: row.id,
      href: `/audit/${row.id}`,
      actor: row.actor_id,
      action: auditActionLabel(row.action),
      entity: `${row.entity_type}${row.entity_id ? ` · ${row.entity_id}` : ""}`,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
});

function deletedCountFromMetadata(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const count = Number((value as Record<string, unknown>).deletedCount);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

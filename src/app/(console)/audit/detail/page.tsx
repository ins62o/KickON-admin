"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Braces, ExternalLink, FileClock, ShieldCheck, UserRound } from "lucide-react";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  auditActionLabel,
  auditChangeSummary,
  auditEntityHref,
  auditEntityLabel,
  auditFieldDiff,
  auditFieldLabel,
  auditRoleLabel,
  getAuditLogDetail,
} from "@/lib/data/audit";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";

const idPattern = /^\d{1,20}$/;
const hiddenOperatorFields = new Set(["id", "created_at", "updated_at", "request_id", "ip_hash"]);

export default function AuditDetailPage() {
  const admin = useRequiredAdminPermission("audit.read");
  const auditId = useSearchParams().get("auditId") ?? "";
  const { data: result, error, loading, reload } = useClientData(
    () => idPattern.test(auditId)
      ? getAuditLogDetail(auditId)
      : Promise.resolve({ data: null, schemaReady: true, error: "변경 기록 번호가 올바르지 않습니다." }),
    [auditId],
  );
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !result) return <ClientPageError message={error ?? "감사 로그를 확인할 수 없습니다."} retry={reload} />;
  if (!result.data) {
    return <Unavailable message={result.error ?? "운영 변경 기록을 찾을 수 없습니다."} />;
  }

  const log = result.data;
  const changed = auditFieldDiff(log.beforeValue, log.afterValue).filter((field) => field.changed);
  const operatorFields = changed.filter((field) => !hiddenOperatorFields.has(field.field));
  const visibleFields = operatorFields.length > 0 ? operatorFields : changed;
  const entityHref = auditEntityHref(log);

  return (
    <div className="mx-auto w-full max-w-[1380px] px-4 py-6 lg:px-6 lg:py-7">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/audit"><ArrowLeft className="size-3.5" />관리자 변경 기록</Link></Button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">변경 내용 확인</h1>
            <Badge variant="outline">{auditActionLabel(log.action)}</Badge>
            <Badge variant="outline" className="text-muted-foreground">{auditEntityLabel(log.entityType)}</Badge>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)} · {formatKoreaDateTime(log.createdAt)}</p>
        </div>
        {entityHref ? <Button asChild variant="outline"><Link href={entityHref}>관련 데이터 열기<ExternalLink className="size-3.5" /></Link></Button> : null}
      </header>

      <section className="mt-6 border-y border-border/80 bg-card/20 px-4 py-5 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.06] text-primary"><ShieldCheck className="size-4" /></div>
          <div><p className="text-xs text-muted-foreground">이 기록에서 확인된 작업</p><h2 className="mt-1 text-sm font-semibold">{auditChangeSummary(log)}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{auditEntityLabel(log.entityType)}에 적용된 실제 변경 전후 값과 변경 사유를 아래에서 확인할 수 있습니다.</p></div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-border/80 bg-card/40 p-4">
          <div className="flex items-center gap-2"><FileClock className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">변경 사유</h2></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{log.reason ?? "변경 사유가 기록되지 않았습니다."}</p>
          {!log.reason ? <p className="mt-2 text-[11px] text-amber-300">사유가 없어 변경 판단 근거를 확인하기 어렵습니다.</p> : null}
        </div>
        <div className="rounded-xl border border-border/80 bg-card/40 p-4">
          <div className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">작업자와 대상</h2></div>
          <dl className="mt-3 space-y-3">
            <Field label="작업자" value={log.actorId ? auditRoleLabel(log.actorRole) : "시스템 자동 작업"} />
            <Field label="작업 대상" value={auditEntityLabel(log.entityType)} />
            <Field label="작업 종류" value={auditActionLabel(log.action)} />
          </dl>
          <details className="mt-4 text-[10px] text-muted-foreground/75">
            <summary className="w-fit cursor-pointer">개발자용 식별 정보</summary>
            <dl className="mt-2 grid gap-1.5 rounded-md border border-border/60 bg-background/45 p-2 font-mono leading-4">
              <div><dt className="inline text-muted-foreground">기록: </dt><dd className="inline break-all">{log.id}</dd></div>
              <div><dt className="inline text-muted-foreground">작업자: </dt><dd className="inline break-all">{log.actorId ?? "시스템"}</dd></div>
              <div><dt className="inline text-muted-foreground">대상 종류: </dt><dd className="inline break-all">{log.entityType}</dd></div>
              <div><dt className="inline text-muted-foreground">대상 ID: </dt><dd className="inline break-all">{log.entityId ?? "없음"}</dd></div>
              <div><dt className="inline text-muted-foreground">요청 ID: </dt><dd className="inline break-all">{log.requestId ?? "없음"}</dd></div>
            </dl>
          </details>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/40">
        <div className="flex flex-col gap-1 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-sm font-semibold">실제 변경 전후</h2><p className="mt-0.5 text-[11px] text-muted-foreground">운영 판단에 필요한 변경 항목만 먼저 보여줍니다.</p></div>
          <Badge variant="outline">변경 {visibleFields.length}개</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>변경 항목</TableHead><TableHead>변경 전</TableHead><TableHead className="w-10" /><TableHead>변경 후</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleFields.length > 0 ? visibleFields.map((field) => (
                <TableRow key={field.field} className="bg-primary/[0.025]">
                  <TableCell><p className="text-xs font-medium">{auditFieldLabel(field.field)}</p><details className="mt-1 text-[10px] text-muted-foreground/70"><summary className="w-fit cursor-pointer">원본 필드명</summary><p className="mt-1 font-mono">{field.field}</p></details></TableCell>
                  <TableCell className="max-w-96"><Value value={field.before} field={field.field} /></TableCell>
                  <TableCell><ArrowRight className="size-3.5 text-muted-foreground" /></TableCell>
                  <TableCell className="max-w-96"><Value value={field.after} field={field.field} /></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={4} className="h-48 text-center"><p className="text-sm font-medium">비교할 변경값이 없습니다</p><p className="mt-1 text-xs text-muted-foreground">원문 기록에서 추가 정보를 확인해 주세요.</p></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <RawValue title="변경 전 전체 기록" value={log.beforeValue} />
        <RawValue title="변경 후 전체 기록" value={log.afterValue} />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 text-xs">{value}</dd></div>;
}

function Value({ value, field }: { value: unknown; field: string }) {
  const technical = value !== null && typeof value === "object" || (typeof value === "string" && (field.endsWith("_id") || field === "id"));
  return <div><p className="break-words text-xs leading-5">{operatorValue(value, field)}</p>{technical ? <details className="mt-1 text-[10px] text-muted-foreground/70"><summary className="w-fit cursor-pointer">원문 값</summary><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded border border-border/60 bg-background/45 p-2 font-mono leading-4">{show(value)}</pre></details> : null}</div>;
}

function operatorValue(value: unknown, field: string) {
  if (value === undefined) return "필드 없음";
  if (value === null || value === "") return "없음";
  if (typeof value === "boolean") return value ? "사용" : "사용 안 함";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "string" && (field.endsWith("_id") || field === "id")) return "연결된 대상 식별값";
  if (Array.isArray(value)) return `목록 ${value.length}개`;
  if (typeof value === "object") return "상세 데이터";
  return String(value);
}

function RawValue({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return <details className="rounded-xl border border-border/80 bg-card/40"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold"><Braces className="size-4 text-muted-foreground" />{title}</summary><pre className="max-h-96 overflow-auto border-t border-border/70 bg-background/35 p-4 font-mono text-[10px] leading-5 text-muted-foreground">{value ? JSON.stringify(value, null, 2).slice(0, 30000) : "기록 없음"}</pre></details>;
}

function show(value: unknown) { return value === undefined ? "필드 없음" : value === null ? "없음" : typeof value === "string" ? value : JSON.stringify(value, null, 2); }

function Unavailable({ message }: { message: string }) {
  return <div className="mx-auto w-full max-w-3xl px-4 py-16"><div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-6 text-center"><FileClock className="mx-auto size-6 text-amber-300" /><h1 className="mt-3 text-base font-semibold">변경 기록 연결 필요</h1><p className="mt-2 text-xs leading-5 text-muted-foreground">{message}</p><Button asChild variant="outline" className="mt-5"><Link href="/audit">목록으로 돌아가기</Link></Button></div></div>;
}

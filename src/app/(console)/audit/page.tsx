import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardClock, FileCheck2, FileQuestion, History, UserRound } from "lucide-react";
import { DataManagementHeader } from "@/components/admin/data-management-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  auditActionLabel,
  auditChangeSummary,
  auditEntityHref,
  auditEntityLabel,
  auditRoleLabel,
  getAuditLogList,
  type AuditLogRecord,
} from "@/lib/data/audit";
import { formatKoreaDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAdminPermission } from "@/lib/auth/server";

export const metadata: Metadata = { title: "데이터 관리 · 관리자 로그" };

export default async function AuditPage() {
  const admin = await requireAdminPermission("audit.read");
  const data = await getAuditLogList();
  const manualChanges = data.logs.filter((log) => log.entityType === "manual_overrides").length;
  const missingReasons = data.logs.filter((log) => !log.reason?.trim()).length;
  const recentOperators = new Set(data.logs.flatMap((log) => log.actorId ? [log.actorId] : [])).size;
  const overview = auditOverview(data.schemaReady, data.logs.length, missingReasons);

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <DataManagementHeader role={admin.role} activeSection="audit" />

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">관리자 로그</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">누가 어떤 데이터를 왜 바꿨는지 확인하고 직접 수정한 값을 추적합니다.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="size-3.5" />
          <span>저장된 기록</span>
          <strong className="text-foreground tabular-nums">{data.total === null ? "확인 불가" : `${formatNumber(data.total)}건`}</strong>
        </div>
      </header>

      {data.error ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/75">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div><p className="font-medium text-amber-100">{data.schemaReady ? "조회 상태를 확인해 주세요" : "변경 기록 연결이 필요합니다"}</p><p className="mt-0.5">{data.error}</p></div>
        </div>
      ) : null}

      <section className="mt-6 border-y border-border/80 bg-card/20 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={overview.badgeClass}>{overview.badge}</Badge><h2 className="text-sm font-semibold">{overview.title}</h2></div>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{overview.detail}</p>
          </div>
          <p className="text-[11px] text-muted-foreground">목록에는 최근 200건까지 표시됩니다.</p>
        </div>
      </section>

      <section aria-label="최근 변경 기록 요약" className="mt-6 grid gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
        <Summary icon={ClipboardClock} label="저장된 전체 기록" value={data.total} detail="삭제하지 않고 보관한 변경 이력" />
        <Summary icon={History} label="현재 표시 중" value={data.logs.length} detail="최근 변경 순서" />
        <Summary icon={FileCheck2} label="직접 수정 보호 작업" value={manualChanges} detail="표시된 기록 중 수동 보정" tone="normal" />
        <Summary icon={UserRound} label="최근 작업자" value={recentOperators} detail="표시된 기록의 고유 작업자" />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="flex flex-col gap-1 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="text-sm font-semibold">최근 변경 내역</h2><p className="mt-0.5 text-xs text-muted-foreground">변경 시각, 대상, 실제 수정 항목과 사유를 함께 보여줍니다.</p></div>
          {missingReasons > 0 ? <span className="text-[11px] text-amber-300">최근 기록 중 사유 미기록 {formatNumber(missingReasons)}건</span> : null}
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead>변경 시각</TableHead><TableHead>작업</TableHead><TableHead>대상</TableHead><TableHead>변경 내용</TableHead><TableHead>변경 사유</TableHead><TableHead>작업자</TableHead><TableHead className="text-right">상세</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.logs.length > 0 ? data.logs.map((log) => <AuditRow key={log.id} log={log} />) : (
                <TableRow><TableCell colSpan={7} className="h-64 text-center"><FileQuestion className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{data.schemaReady ? "아직 저장된 변경 기록이 없습니다" : "변경 기록 데이터를 아직 연결하지 않았습니다"}</p><p className="mt-1 text-xs text-muted-foreground">실제 운영 작업이 기록되면 이곳에 표시합니다.</p></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function AuditRow({ log }: { log: AuditLogRecord }) {
  const entityHref = auditEntityHref(log);
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap"><p className="text-xs tabular-nums">{formatRelativeTime(log.createdAt)}</p><p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{formatKoreaDateTime(log.createdAt)}</p></TableCell>
      <TableCell><ActionBadge action={log.action} /></TableCell>
      <TableCell className="max-w-56">
        {entityHref ? <Link href={entityHref} className="text-xs font-medium hover:text-primary hover:underline hover:underline-offset-4">{auditEntityLabel(log.entityType)}</Link> : <p className="text-xs font-medium">{auditEntityLabel(log.entityType)}</p>}
        <details className="mt-1 text-[10px] text-muted-foreground/70"><summary className="w-fit cursor-pointer">기술 식별값</summary><div className="mt-1 rounded border border-border/60 bg-background/40 p-2 font-mono"><p className="break-all">종류: {log.entityType}</p><p className="mt-1 break-all">대상: {log.entityId ?? "없음"}</p></div></details>
      </TableCell>
      <TableCell className="max-w-72"><Link href={`/audit/${log.id}`} className="line-clamp-2 text-xs font-medium leading-5 hover:text-primary hover:underline hover:underline-offset-4">{auditChangeSummary(log)}</Link></TableCell>
      <TableCell className="max-w-96"><p className={cn("line-clamp-2 text-xs leading-5", !log.reason && "text-muted-foreground")}>{log.reason ?? "변경 사유가 기록되지 않았습니다."}</p></TableCell>
      <TableCell><p className="text-xs">{log.actorId ? auditRoleLabel(log.actorRole) : "시스템 자동 작업"}</p>{log.actorId ? <details className="mt-1 text-[10px] text-muted-foreground/70"><summary className="w-fit cursor-pointer">작업자 식별값</summary><p className="mt-1 max-w-44 break-all rounded border border-border/60 bg-background/40 p-2 font-mono">{log.actorId}</p></details> : null}</TableCell>
      <TableCell className="text-right"><Button asChild variant="outline" size="sm"><Link href={`/audit/${log.id}`}>변경 확인<ArrowRight className="size-3.5" /></Link></Button></TableCell>
    </TableRow>
  );
}

function auditOverview(schemaReady: boolean, shown: number, missingReasons: number) {
  if (!schemaReady) return { badge: "연결 필요", title: "관리자 변경 기록을 아직 확인할 수 없습니다", detail: "운영 스키마를 연결하면 수동 수정과 상태 변경을 빠짐없이 추적할 수 있습니다.", badgeClass: "border-muted-foreground/20 text-muted-foreground" };
  if (shown === 0) return { badge: "기록 없음", title: "아직 저장된 운영 변경 기록이 없습니다", detail: "관리자가 데이터 또는 처리 상태를 바꾸면 작업자, 변경 전후 값, 사유와 시각을 저장합니다.", badgeClass: "border-border text-muted-foreground" };
  if (missingReasons > 0) return { badge: "확인 필요", title: `최근 기록 중 변경 사유가 없는 항목이 ${formatNumber(missingReasons)}건 있습니다`, detail: "사유가 없는 변경은 나중에 판단 근거를 확인하기 어렵습니다. 해당 기록의 상세 내용을 먼저 확인해 주세요.", badgeClass: "border-amber-400/25 bg-amber-400/[0.07] text-amber-300" };
  return { badge: "기록 정상", title: "최근 운영 변경에 사유가 모두 기록되어 있습니다", detail: "아래 목록에서 작업자와 변경 전후 값을 확인할 수 있습니다.", badgeClass: "border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-300" };
}

function ActionBadge({ action }: { action: string }) {
  const normalized = action.toUpperCase();
  return <Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", normalized === "DELETE" && "border-rose-400/20 text-rose-300", normalized === "UPDATE" && "border-sky-400/20 text-sky-300", normalized === "INSERT" && "border-emerald-400/20 text-emerald-300", normalized === "RETENTION_CLEANUP" && "border-amber-400/20 text-amber-300")}>{auditActionLabel(action)}</Badge>;
}

function Summary({ icon: Icon, label, value, detail, tone }: { icon: typeof History; label: string; value: number | null; detail: string; tone?: "normal" }) {
  return <article className="bg-card/60 p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className={cn("size-4 text-muted-foreground", tone === "normal" && "text-emerald-400")} /></div><p className="mt-3 text-2xl font-semibold tabular-nums">{value === null ? "확인 불가" : formatNumber(value)}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></article>;
}

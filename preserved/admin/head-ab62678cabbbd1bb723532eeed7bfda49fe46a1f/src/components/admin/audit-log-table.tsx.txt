import { AuditLogLinkRow } from "@/components/admin/audit-log-link-row";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import {
  auditActionLabel,
  auditChangeSummary,
  auditRoleLabel,
  type AuditLogRecord,
} from "@/lib/data/audit";
import { formatKoreaFullDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AuditLogTable({
  logs,
  schemaReady,
  compactOnMobile = false,
}: {
  logs: AuditLogRecord[];
  schemaReady: boolean;
  compactOnMobile?: boolean;
}) {
  return (
    <>
      {compactOnMobile ? <div className="divide-y divide-border/70 md:hidden">
        {logs.length > 0 ? logs.map((log) => {
          const changeSummary = auditChangeSummary(log);
          return <Link key={log.id} href={`/audit/detail/?auditId=${encodeURIComponent(log.id)}`} className="block px-4 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`${changeSummary} 변경 확인`}>
            <div className="flex items-start justify-between gap-3"><p className="line-clamp-2 min-w-0 text-sm font-semibold leading-5">{changeSummary}</p><ActionBadge action={log.action} /></div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span className="tabular-nums">{formatKoreaFullDateTime(log.createdAt)}</span><span>{log.actorId ? auditRoleLabel(log.actorRole) : "시스템 자동 작업"}</span></div>
            <p className={cn("mt-2 line-clamp-2 text-xs leading-5", !log.reason && "text-muted-foreground")}>{log.reason ?? "변경 사유가 기록되지 않았습니다."}</p>
          </Link>;
        }) : <div className="flex min-h-52 items-center justify-center px-5 text-center"><p className="text-sm font-medium">{schemaReady ? "아직 저장된 변경 기록이 없습니다" : "변경 기록 데이터를 아직 연결하지 않았습니다"}</p></div>}
      </div> : null}
      <div className={cn("overflow-x-auto", compactOnMobile && "hidden md:block")}>
      <Table className="min-w-[880px]">
        <TableHeader className="[&_th]:h-12 [&_th]:px-3">
          <TableRow className="hover:bg-transparent">
            <TableHead>변경 시각</TableHead>
            <TableHead>작업</TableHead>
            <TableHead>변경 내용</TableHead>
            <TableHead>변경 사유</TableHead>
            <TableHead>작업자</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="[&_td]:px-3 [&_td]:py-4">
          {logs.length > 0 ? (
            logs.map((log) => <AuditRow key={log.id} log={log} />)
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="h-64 text-center">
                <p className="text-sm font-medium">
                  {schemaReady ? "아직 저장된 변경 기록이 없습니다" : "변경 기록 데이터를 아직 연결하지 않았습니다"}
                </p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </div>
    </>
  );
}

function AuditRow({ log }: { log: AuditLogRecord }) {
  const detailHref = `/audit/detail/?auditId=${encodeURIComponent(log.id)}`;
  const changeSummary = auditChangeSummary(log);

  return (
    <AuditLogLinkRow href={detailHref} label={`${changeSummary} 변경 확인`}>
      <TableCell className="whitespace-nowrap text-xs tabular-nums">
        {formatKoreaFullDateTime(log.createdAt)}
      </TableCell>
      <TableCell><ActionBadge action={log.action} /></TableCell>
      <TableCell className="max-w-72">
        <p className="line-clamp-2 text-xs font-medium leading-5">{changeSummary}</p>
      </TableCell>
      <TableCell className="max-w-96">
        <p className={cn("line-clamp-2 text-xs leading-5", !log.reason && "text-muted-foreground")}>
          {log.reason ?? "변경 사유가 기록되지 않았습니다."}
        </p>
      </TableCell>
      <TableCell>
        <p className="text-xs">{log.actorId ? auditRoleLabel(log.actorRole) : "시스템 자동 작업"}</p>
      </TableCell>
    </AuditLogLinkRow>
  );
}

function ActionBadge({ action }: { action: string }) {
  const normalized = action.toUpperCase();

  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap text-[10px]",
        normalized === "DELETE" && "border-rose-400/20 text-rose-300",
        normalized === "UPDATE" && "border-sky-400/20 text-sky-300",
        normalized === "INSERT" && "border-emerald-400/20 text-emerald-300",
        normalized === "RETENTION_CLEANUP" && "border-amber-400/20 text-amber-300",
      )}
    >
      {auditActionLabel(action)}
    </Badge>
  );
}

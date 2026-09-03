import { AuditLogLinkRow } from "@/components/admin/audit-log-link-row";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
}: {
  logs: AuditLogRecord[];
  schemaReady: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[880px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>변경 시각</TableHead>
            <TableHead>작업</TableHead>
            <TableHead>변경 내용</TableHead>
            <TableHead>변경 사유</TableHead>
            <TableHead>작업자</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
  );
}

function AuditRow({ log }: { log: AuditLogRecord }) {
  const detailHref = `/audit/${log.id}`;
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

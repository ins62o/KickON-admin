import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelativeTime } from "@/lib/format";
import type { SyncState } from "@/lib/data/types";

export function SyncTable({ rows }: { rows: SyncState[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium">동기화 상태를 읽을 수 없습니다</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">football_sync_state는 인증된 사용자만 읽을 수 있습니다. 관리자 인증 또는 서버 전용 키를 연결하세요.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>작업</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>마지막 성공</TableHead>
          <TableHead className="text-right">오류</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 7).map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <p className="text-sm font-medium">{row.label}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.key}</p>
            </TableCell>
            <TableCell><StatusBadge status={row.status} /></TableCell>
            <TableCell className="tabular text-xs text-muted-foreground">{formatRelativeTime(row.succeededAt)}</TableCell>
            <TableCell className="max-w-52 truncate text-right text-xs text-muted-foreground">{row.error ?? "없음"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

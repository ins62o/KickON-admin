import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Braces, DatabaseZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OperationColumn, OperationDataset } from "@/lib/data/admin-operations";
import { formatKoreaDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function displayValue(value: string | number | null, column: OperationColumn) {
  if (value === null || value === "") return <span className="text-muted-foreground/60">확인 불가</span>;
  if (column.kind === "time") return <span className="tabular whitespace-nowrap text-muted-foreground">{formatKoreaDateTime(String(value))}</span>;
  if (column.kind === "number") return <span className="tabular whitespace-nowrap">{value}</span>;
  if (column.kind === "mono") return <span className="font-mono text-[11px] text-muted-foreground">{value}</span>;
  if (column.kind === "status") {
    const text = String(value);
    const danger = /fatal|error|failed|urgent|rejected|치명|오류|실패|긴급|장애/i.test(text);
    const success = /resolved|succeeded|complete|정상|완료|해결/i.test(text);
    return (
      <Badge variant="outline" className={cn(
        "h-5 rounded-md px-1.5 font-mono text-[10px] font-medium",
        danger && "border-rose-400/20 bg-rose-400/10 text-rose-300",
        success && "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
        !danger && !success && "border-border bg-muted/60 text-muted-foreground",
      )}>{text}</Badge>
    );
  }
  return <span className="line-clamp-2 max-w-[520px]">{value}</span>;
}

export function OperationSection({ dataset, icon: Icon }: { dataset: OperationDataset; icon: LucideIcon }) {
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{dataset.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{dataset.description}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <DatabaseZap className="size-3.5" />
          <span className="font-mono">{dataset.source}</span>
          <span>·</span>
          <strong className="tabular text-foreground">{dataset.total === null ? "확인 불가" : `${dataset.total.toLocaleString("ko-KR")}건`}</strong>
        </div>
      </div>

      {dataset.error && (
        <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs leading-5 text-amber-100/75">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="font-medium text-amber-100">{dataset.schemaReady ? "조회 확인 필요" : "연동 필요"}</p>
            <p className="mt-0.5">{dataset.error}</p>
          </div>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground"><Icon className="size-4" /></div>
          <div>
            <h2 className="text-sm font-semibold">최근 기록</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">최신 200건까지 표시</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {dataset.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dataset.rows.length > 0 ? dataset.rows.map((row) => (
                <TableRow key={String(row.id)}>
                  {dataset.columns.map((column, index) => <TableCell key={column.key}>{index === 0 && row.href ? <Link href={String(row.href)} className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-4">{displayValue(row[column.key], column)}</Link> : displayValue(row[column.key], column)}</TableCell>)}
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={dataset.columns.length} className="h-64 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground"><Braces className="size-4" /></div>
                      <p className="mt-3 text-sm font-medium">{dataset.schemaReady ? "기록이 없습니다" : "데이터 계약이 아직 적용되지 않았습니다"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">임의의 예시 데이터는 표시하지 않습니다.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

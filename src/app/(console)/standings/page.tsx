import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Database, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStandingsData } from "@/lib/data/operations";
import { compareEntityValues, getProviderSnapshotIndex, standingComparableValue } from "@/lib/data/provider-diffs";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAdminPermission } from "@/lib/auth/server";

export const metadata: Metadata = { title: "팀 순위" };

export default async function StandingsPage() {
  await requireAdminPermission("data.read");
  const result = await getStandingsData();
  const providerSnapshots = await getProviderSnapshotIndex("standing", result.data.map((row) => row.teamId));
  const latestUpdate = result.data.reduce<string | null>((latest, row) => !latest || new Date(row.updatedAt) > new Date(latest) ? row.updatedAt : latest, null);
  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-6 lg:py-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">팀 순위</h1><p className="mt-1.5 text-sm text-muted-foreground">2026 K리그 팀 순위와 시즌 성적을 확인합니다.</p></div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><Badge variant="outline" className="rounded-md">2026 시즌</Badge><span>마지막 업데이트 <strong className="text-foreground">{formatRelativeTime(latestUpdate)}</strong></span></div>
      </div>
      {result.error ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/70"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />{result.error}</div> : null}
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3"><div><h2 className="text-sm font-semibold">리그 순위표</h2><p className="mt-0.5 text-xs text-muted-foreground">현재 앱에 반영된 순위와 외부 최신값을 함께 확인합니다.</p></div><span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><GitCompareArrows className="size-3.5" /> {providerSnapshots.snapshots.size > 0 ? `외부 데이터 ${providerSnapshots.snapshots.size}개 확인됨` : "비교할 외부 데이터 없음"}</span></div>
        <div className="overflow-x-auto">
          <Table className="min-w-[920px]">
            <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-16 text-center">순위</TableHead><TableHead>구단</TableHead><TableHead className="text-right">경기</TableHead><TableHead className="text-right">승</TableHead><TableHead className="text-right">무</TableHead><TableHead className="text-right">패</TableHead><TableHead className="text-right">득점</TableHead><TableHead className="text-right">실점</TableHead><TableHead className="text-right">득실차</TableHead><TableHead className="text-right">승점</TableHead><TableHead>마지막 업데이트</TableHead><TableHead>비교 상태</TableHead><TableHead className="text-right">상세</TableHead></TableRow></TableHeader>
            <TableBody>
              {result.data.length > 0 ? result.data.map((row) => {
                const snapshot = providerSnapshots.snapshots.get(row.teamId) ?? null;
                const differences = compareEntityValues("standing", standingComparableValue(row), snapshot).filter((field) => field.different);
                return <TableRow key={row.teamId} className={cn(differences.length > 0 && "bg-amber-400/[0.035]")}>
                  <TableCell className="tabular text-center font-mono text-sm font-semibold">{row.rank}</TableCell>
                  <TableCell><Link href={`/standings/${row.teamId}`} className="flex min-w-44 items-center gap-3 font-medium hover:text-primary">{row.logoPath ? <span className="relative size-8 overflow-hidden rounded-md bg-white p-1"><Image src={row.logoPath} alt={`${row.teamName} 로고`} fill sizes="32px" className="object-contain p-1" /></span> : <span className="flex size-8 items-center justify-center rounded-md bg-muted text-[9px]">{row.teamId.slice(0, 2)}</span>}{row.teamName}</Link></TableCell>
                  <TableCell className="tabular text-right">{row.played}</TableCell><TableCell className="tabular text-right">{row.won}</TableCell><TableCell className="tabular text-right">{row.drawn}</TableCell><TableCell className="tabular text-right">{row.lost}</TableCell><TableCell className="tabular text-right">{row.goalsFor}</TableCell><TableCell className="tabular text-right">{row.goalsAgainst}</TableCell><TableCell className="tabular text-right">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell><TableCell className="tabular text-right text-sm font-semibold">{row.points}</TableCell><TableCell className="tabular whitespace-nowrap text-xs text-muted-foreground">{formatRelativeTime(row.updatedAt)}</TableCell><TableCell>{!snapshot ? <Badge variant="outline" className="text-muted-foreground"><Database className="size-3" /> 비교 자료 없음</Badge> : differences.length > 0 ? <Badge variant="outline" className="border-amber-400/25 text-amber-200">확인 필요 {differences.length}</Badge> : <Badge variant="outline" className="border-emerald-400/20 text-emerald-200"><CheckCircle2 className="size-3" /> 일치</Badge>}</TableCell><TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/standings/${row.teamId}`}>값 확인 <ArrowRight className="size-3.5" /></Link></Button></TableCell>
                </TableRow>;
              }) : <TableRow><TableCell colSpan={13} className="h-64 text-center text-sm text-muted-foreground">순위 데이터가 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

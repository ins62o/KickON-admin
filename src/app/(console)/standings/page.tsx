import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { ClickableTableRow } from "@/components/ui/clickable-table-row";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStandingsData } from "@/lib/data/operations";
import { requireAdminPermission } from "@/lib/auth/server";

export const metadata: Metadata = { title: "팀 관리" };

export default async function StandingsPage() {
  await requireAdminPermission("data.read");
  const result = await getStandingsData();
  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <PageHeader title="팀 관리" />
      {result.error ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/70"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />{result.error}</div> : null}
      <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35">
        <div className="border-b border-border/70 px-11 py-4">
          <h2 className="text-base font-semibold">하나은행 K리그1 2026</h2>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1040px] table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[7%] text-center text-sm font-semibold">순위</TableHead>
                <TableHead className="w-[29%] text-sm font-semibold">구단</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">경기</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">승</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">무</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">패</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">득점</TableHead>
                <TableHead className="w-[8%] text-right text-sm font-semibold">실점</TableHead>
                <TableHead className="w-[9%] text-right text-sm font-semibold">득실차</TableHead>
                <TableHead className="w-[7%] pr-5 text-right text-sm font-semibold">승점</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.length > 0 ? result.data.map((row) => (
                <ClickableTableRow key={row.teamId} href={`/standings/${row.teamId}`}>
                  <TableCell className="tabular py-5 text-center font-mono text-base font-semibold">{row.rank}</TableCell>
                  <TableCell className="py-5">
                    <Link href={`/standings/${row.teamId}`} className="flex min-w-44 items-center gap-3.5 rounded-md text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {row.logoPath ? (
                        <span className="relative size-10 overflow-hidden rounded-lg bg-white p-1">
                          <Image src={row.logoPath} alt={`${row.teamName} 로고`} fill sizes="40px" className="object-contain p-1" />
                        </span>
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-xs">{row.teamId.slice(0, 2)}</span>
                      )}
                      {row.teamName}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.played}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.won}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.drawn}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.lost}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.goalsFor}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.goalsAgainst}</TableCell>
                  <TableCell className="tabular py-5 text-right text-sm">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</TableCell>
                  <TableCell className="tabular py-5 pr-5 text-right text-base font-semibold">{row.points}</TableCell>
                </ClickableTableRow>
              )) : <TableRow><TableCell colSpan={10} className="h-64 text-center text-sm text-muted-foreground">순위 데이터가 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

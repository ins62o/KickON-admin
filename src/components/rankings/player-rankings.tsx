"use client";

import Link from "next/link";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PlayerRankingRecord } from "@/lib/data/types";

type RankingMetric = "goals" | "assists" | "appearances";

const metricLabels: Record<RankingMetric, string> = { goals: "득점", assists: "도움", appearances: "출전" };

export function PlayerRankings({ players }: { players: PlayerRankingRecord[] }) {
  const [metric, setMetric] = useState<RankingMetric>("goals");
  const [teamId, setTeamId] = useState("all");
  const teams = Array.from(new Map(players.map((player) => [player.teamId, player.teamName])))
    .map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const ranking = players
    .filter((player) => teamId === "all" || player.teamId === teamId)
    .sort((a, b) => b[metric] - a[metric] || b.appearances - a.appearances || (a.koreanName ?? a.playerName).localeCompare(b.koreanName ?? b.playerName, "ko"))
    .slice(0, 100);

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center">
        <Tabs value={metric} onValueChange={(value) => setMetric(value as RankingMetric)}>
          <TabsList><TabsTrigger value="goals">득점</TabsTrigger><TabsTrigger value="assists">도움</TabsTrigger><TabsTrigger value="appearances">출전</TabsTrigger></TabsList>
        </Tabs>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-44 bg-background/60"><SelectValue placeholder="구단 선택" /></SelectTrigger>
          <SelectContent><SelectItem value="all">전체 구단</SelectItem>{teams.map((team) => <SelectItem key={team.value} value={team.value}>{team.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">상위 {ranking.length}명</span>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-16 text-center">순위</TableHead><TableHead>선수</TableHead><TableHead>구단</TableHead><TableHead className="text-right">득점</TableHead><TableHead className="text-right">도움</TableHead><TableHead className="text-right">출전</TableHead></TableRow></TableHeader>
          <TableBody>{ranking.length > 0 ? ranking.map((player, index) => {
            const displayName = player.koreanName ?? player.playerName;
            return <TableRow key={`${player.teamId}-${player.playerId}`} className={index < 3 ? "bg-primary/[0.025]" : undefined}><TableCell className="tabular text-center font-mono text-sm font-semibold">{index + 1}</TableCell><TableCell><Link href={`/players/${player.playerId}`} className="inline-block min-w-44 rounded-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="block">{displayName}</span>{player.playerName !== displayName ? <span className="block text-[10px] font-normal text-muted-foreground">{player.playerName}</span> : null}</Link></TableCell><TableCell>{player.teamName}</TableCell><TableCell className={`tabular text-right ${metric === "goals" ? "text-sm font-semibold text-primary" : ""}`}>{player.goals}</TableCell><TableCell className={`tabular text-right ${metric === "assists" ? "text-sm font-semibold text-primary" : ""}`}>{player.assists}</TableCell><TableCell className={`tabular text-right ${metric === "appearances" ? "text-sm font-semibold text-primary" : ""}`}>{player.appearances}</TableCell></TableRow>;
          }) : <TableRow><TableCell colSpan={6} className="h-64 text-center text-sm text-muted-foreground">조건에 맞는 순위 데이터가 없습니다.</TableCell></TableRow>}</TableBody>
        </Table>
      </div>
      <div className="border-t border-border/70 px-4 py-3 text-[11px] text-muted-foreground">현재 선택 지표: {metricLabels[metric]}. 출전 시간, 선발, 경고, 퇴장 기록은 아직 제공되지 않습니다.</div>
    </div>
  );
}

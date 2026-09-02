import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, GitCompareArrows, RefreshCcw, Trophy, UsersRound } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { ClubSummary } from "@/lib/data/types";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";

export function ClubCard({ club }: { club: ClubSummary }) {
  return (
    <Link href={`/clubs/${club.id}`} className="group block rounded-xl border border-border/80 bg-card/45 p-4 transition-colors hover:border-primary/30 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-white p-1.5">
          {club.logoPath ? <Image src={club.logoPath} alt={`${club.name} 로고`} width={34} height={34} className="size-8 object-contain" /> : <span className="text-xs font-bold text-zinc-700">{club.code.slice(0, 2)}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{club.name}</h3>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{club.code} · {club.division ?? "리그 확인 필요"}</p>
            </div>
            <ArrowUpRight className="size-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 border-y border-border/65 py-3">
        <div><p className="text-[10px] text-muted-foreground">현재 순위</p><p className="tabular mt-1 text-sm font-semibold">{club.rank ? `${club.rank}위` : "확인 불가"}</p></div>
        <div className="border-l border-border/65 pl-3"><p className="text-[10px] text-muted-foreground">승점</p><p className="tabular mt-1 text-sm font-semibold">{club.points ?? "-"}</p></div>
        <div className="border-l border-border/65 pl-3"><p className="text-[10px] text-muted-foreground">선수</p><p className="tabular mt-1 text-sm font-semibold">{club.playerCount === null ? "-" : `${club.playerCount}명`}</p></div>
      </div>

      <div className="mt-3 space-y-2.5 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Trophy className="size-3.5" />
          <span>최근 경기</span>
          <span className="ml-auto max-w-52 truncate text-foreground/75" title={club.recentFixture ? `${club.recentFixture.homeTeam} ${club.recentFixture.homeScore ?? "-"} : ${club.recentFixture.awayScore ?? "-"} ${club.recentFixture.awayTeam}` : undefined}>{club.recentFixture ? `${club.recentFixture.homeTeam} ${club.recentFixture.homeScore ?? "-"} : ${club.recentFixture.awayScore ?? "-"} ${club.recentFixture.awayTeam}` : "결과 없음"}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <UsersRound className="size-3.5" />
          <span>선수 데이터</span>
          <span className="ml-auto tabular text-foreground/75">{formatRelativeTime(club.playerUpdatedAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCcw className="size-3.5" />
          <span>경기 데이터</span>
          <span className="ml-auto tabular text-foreground/75">{formatRelativeTime(club.fixtureUpdatedAt)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <GitCompareArrows className="size-3.5" />
          <span>최근 선수 변동</span>
          <span className="ml-auto text-foreground/75">{club.changeCount === null ? "연동 필요" : club.changeCount > 0 ? `${club.changeCount}건 · ${formatRelativeTime(club.latestChangeAt)}` : "없음"}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock className="size-3.5" />
          <span>다음 경기</span>
          <span className="ml-auto max-w-52 truncate text-foreground/75" title={club.nextFixture ? `${formatKoreaDateTime(club.nextFixture.kickoffAt)} ${club.nextFixture.opponent}` : undefined}>{club.nextFixture ? `${formatKoreaDateTime(club.nextFixture.kickoffAt)} ${club.nextFixture.opponent}` : "예정 없음"}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <StatusBadge status={club.status} />
        <span className="text-[10px] text-muted-foreground">제보 {club.reportCount === null ? "연동 필요" : `${club.reportCount}건`}</span>
      </div>
    </Link>
  );
}

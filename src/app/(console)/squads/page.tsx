import type { Metadata } from "next";
import { AlertTriangle, Languages, LockKeyhole, UsersRound } from "lucide-react";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { PlayersTable } from "@/components/players/players-table";
import { ManualPlayerForm } from "@/components/admin/manual-player-form";
import { requireAdminPermission } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { getDashboardData } from "@/lib/data/dashboard";
import { getPlayersData } from "@/lib/data/operations";
import { getActivePlayerOverrideCounts } from "@/lib/data/player-operations";
import { formatNumber, formatRelativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "선수단 관리" };

export default async function SquadsPage() {
  const admin = await requireAdminPermission("data.read");
  const [result, overrideCounts, dashboard] = await Promise.all([getPlayersData(), getActivePlayerOverrideCounts(), getDashboardData()]);
  const players = result.data.map((player) => ({ ...player, manualOverrideCount: overrideCounts.get(player.id) ?? 0 }));
  const activeCount = players.filter((player) => player.inSquad).length;
  const localizedCount = players.filter((player) => player.koreanName).length;
  const protectedCount = players.filter((player) => player.manualOverrideCount > 0).length;
  const latestUpdate = players.reduce<string | null>((latest, player) => !latest || new Date(player.updatedAt) > new Date(latest) ? player.updatedAt : latest, null);

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader context="FOOTBALL DATA" title="선수단 관리" description="선수 이름, 소속 팀, 등번호, 포지션과 수동 보호 상태를 관리합니다. 선수 사진은 수집하거나 표시하지 않습니다." metadata={<span>최근 갱신 {formatRelativeTime(latestUpdate)}</span>} />
    {result.error ? <div role="alert" className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{result.error}</div> : null}
    <MetricStrip className="mt-6" items={[
      { id: "all", label: "전체 시즌 레코드", value: `${formatNumber(players.length)}명`, icon: UsersRound, tone: "accent" },
      { id: "active", label: "현재 선수단", value: `${formatNumber(activeCount)}명`, icon: UsersRound },
      { id: "localized", label: "검증된 한글명", value: `${formatNumber(localizedCount)}명`, icon: Languages },
      { id: "protected", label: "수동 보호", value: `${formatNumber(protectedCount)}명`, icon: LockKeyhole, tone: protectedCount > 0 ? "warning" : "neutral" },
    ]} />
    {!admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write") ? <details className="mt-6 rounded-xl border border-border/80 bg-card/35"><summary className="cursor-pointer px-4 py-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">수동 선수 등록</summary><div className="border-t border-border/70 p-4"><p className="mb-4 text-xs leading-5 text-muted-foreground">SportsMonks에 아직 없는 선수만 등록하세요. 새 레코드는 자동 동기화로부터 잠깁니다. 사진은 입력하지 않습니다.</p><ManualPlayerForm teams={dashboard.clubs.map((club) => ({ id: club.id, name: club.name }))} /></div></details> : null}
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="squad-list-title"><div className="border-b border-border/70 px-4 py-3.5"><h2 id="squad-list-title" className="text-sm font-semibold">선수 목록</h2><p className="mt-0.5 text-xs text-muted-foreground">검색과 정렬 후 상세에서 원본 비교·검증명·수동 보호를 확인합니다.</p></div><PlayersTable players={players} /></section>
  </div>;
}

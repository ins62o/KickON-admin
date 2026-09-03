import type { Metadata } from "next";
import { AlertTriangle, Globe2, UsersRound } from "lucide-react";
import { MetricStrip } from "@/components/admin/metric-strip";
import { PageHeader } from "@/components/admin/page-header";
import { PlayersTable } from "@/components/players/players-table";
import { ManualPlayerDialog } from "@/components/admin/manual-player-form";
import { requireAdminPermission } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { getDashboardData } from "@/lib/data/dashboard";
import { getPlayersData } from "@/lib/data/operations";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "선수 관리" };

export default async function SquadsPage() {
  const admin = await requireAdminPermission("data.read");
  const [result, dashboard] = await Promise.all([getPlayersData(), getDashboardData()]);
  const players = result.data;
  const translationNeededCount = players.filter((player) => !player.koreanName?.trim()).length;
  const canRegisterPlayer = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write");
  const teamOptions = dashboard.clubs.map((club) => ({ id: club.id, name: club.name }));

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader
      title="선수 관리"
      actions={canRegisterPlayer ? <ManualPlayerDialog teams={teamOptions} /> : null}
      actionsLabel="선수 관리"
    />
    {result.error ? <div role="alert" className="mt-5 flex items-start gap-3 border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{result.error}</div> : null}
    <MetricStrip className="mt-6" items={[
      { id: "all", label: "전체 선수", value: `${formatNumber(players.length)}명`, icon: UsersRound, tone: "accent" },
      { id: "translation-needed", label: "번역 필요 선수명", value: `${formatNumber(translationNeededCount)}명`, icon: Globe2, tone: "accent" },
    ]} />
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="squad-list-title">
      <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4">
        <h2 id="squad-list-title" className="text-base font-semibold">선수 목록</h2>
        <span className="tabular shrink-0 text-sm text-muted-foreground">{formatNumber(players.length)}건</span>
      </div>
      <PlayersTable players={players} />
    </section>
  </div>;
}

import Image from "next/image";
import { notFound } from "next/navigation";
import { AlertTriangle, Database, Trophy } from "lucide-react";
import { EntityOverrideControl } from "@/components/operations/entity-override-control";
import { TeamPlayersTable } from "@/components/players/team-players-table";
import { Badge } from "@/components/ui/badge";
import { requireAdminPermission } from "@/lib/auth/server";
import { getStandingsData, getTeamPlayersData } from "@/lib/data/operations";
import { standingComparableValue } from "@/lib/data/provider-diffs";
import { formatKoreaDateTime } from "@/lib/format";
import { reportReferenceReason } from "@/lib/report-reference";

export default async function StandingDetailPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<{ action?: string; reportId?: string }> }) {
  const [{ teamId }, query] = await Promise.all([params, searchParams]);
  const [admin, standings, players] = await Promise.all([requireAdminPermission("data.read"), getStandingsData(), getTeamPlayersData(teamId)]);
  const standing = standings.data.find((row) => row.teamId === teamId);
  if (!standing) notFound();
  const currentValue = standingComparableValue(standing);
  const canOverride = !admin.isDevelopmentBypass && ["admin", "super_admin"].includes(admin.role);

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">{standing.logoPath ? <Image src={standing.logoPath} alt={`${standing.teamName} 로고`} fill sizes="64px" className="object-contain p-2" priority /> : <Trophy className="size-6 text-zinc-700" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{standing.teamName}</h1><Badge variant="outline">2026 시즌</Badge></div><p className="mt-1 text-xs text-muted-foreground">마지막 업데이트 {formatKoreaDateTime(standing.updatedAt)}</p></div><EntityOverrideControl entityType="standing" entityId={standing.teamId} overrides={[]} currentValues={currentValue} canEdit={canOverride} openApply={query.action === "override"} defaultReason={reportReferenceReason(query.reportId)} triggerLabel="팀 수정" dialogTitle="팀 수정" dialogDescription={false} submitLabel="저장" triggerClassName="h-10 px-5 font-bold" showTriggerIcon={false} showSubmitIcon={false} showActiveOverrides={false} /></header>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="현재 순위" value={`${standing.rank}위`} /><Metric label="승점" value={`${standing.points}점`} /><Metric label="경기" value={`${standing.played}`} /><Metric label="승/무/패" value={`${standing.won}/${standing.drawn}/${standing.lost}`} /><Metric label="득점/실점" value={`${standing.goalsFor}/${standing.goalsAgainst}`} /></section>

    <section className="mt-6 rounded-xl border border-border/80 bg-card/40 p-5"><div className="flex items-center gap-2"><Database className="size-5 text-muted-foreground" /><h2 className="text-lg font-semibold">추가 순위 기록</h2></div><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="득실차" value={standing.goalDifference} /><Field label="클린시트" value={standing.cleanSheets} /><Field label="평균 점유율" value={standing.averagePossession === null ? null : `${standing.averagePossession}%`} /></dl></section>

    {players.error ? <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-3 text-sm text-amber-100/75"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />선수 구성원을 모두 불러오지 못했습니다.</div> : null}
    <TeamPlayersTable players={players.data} />
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-xl border border-border/80 bg-card/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular">{value}</p></article>; }
function Field({ label, value }: { label: string; value: string | number | null }) { return <div className="rounded-lg border border-border bg-background/35 p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1.5 break-all text-base font-semibold tabular">{value ?? "확인 불가"}</dd></div>; }

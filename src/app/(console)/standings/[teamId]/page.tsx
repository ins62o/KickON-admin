import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, LockKeyhole, RefreshCcw, Trophy } from "lucide-react";
import { DataDiffPanel } from "@/components/operations/data-diff-panel";
import { EntityOverrideControl } from "@/components/operations/entity-override-control";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdminPermission } from "@/lib/auth/server";
import { getStandingsData } from "@/lib/data/operations";
import { compareEntityValues, getEntityProviderOperations, standingComparableValue } from "@/lib/data/provider-diffs";
import { formatKoreaDateTime } from "@/lib/format";
import { reportReferenceReason } from "@/lib/report-reference";

export default async function StandingDetailPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<{ action?: string; reportId?: string }> }) {
  const [{ teamId }, query] = await Promise.all([params, searchParams]);
  const [admin, standings, providerOperations] = await Promise.all([requireAdminPermission("data.read"), getStandingsData(), getEntityProviderOperations("standing", teamId)]);
  const standing = standings.data.find((row) => row.teamId === teamId);
  if (!standing) notFound();
  const currentValue = standingComparableValue(standing);
  const fields = compareEntityValues("standing", currentValue, providerOperations.snapshot, providerOperations.overrides);
  const activeOverrides = providerOperations.overrides.filter((item) => !item.releasedAt);
  const canOverride = !admin.isDevelopmentBypass && ["admin", "super_admin"].includes(admin.role);

  return <div className="mx-auto w-full max-w-[1380px] px-4 py-6 lg:px-6 lg:py-7">
    <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2"><Link href="/standings"><ArrowLeft className="size-3.5" /> 팀 순위</Link></Button>
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">{standing.logoPath ? <Image src={standing.logoPath} alt={`${standing.teamName} 로고`} fill sizes="64px" className="object-contain p-2" priority /> : <Trophy className="size-6 text-zinc-700" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{standing.teamName} 순위 상세</h1><Badge variant="outline">2026 시즌</Badge>{activeOverrides.length > 0 ? <Badge variant="outline" className="border-primary/25 text-primary"><LockKeyhole className="size-3" /> 직접 수정 보호 {activeOverrides.length}</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">마지막 업데이트 {formatKoreaDateTime(standing.updatedAt)}</p></div><Button asChild variant="outline"><Link href="/sync"><RefreshCcw className="size-4" /> 순위 데이터 새로고침</Link></Button></header>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="현재 순위" value={`${standing.rank}위`} /><Metric label="승점" value={`${standing.points}점`} /><Metric label="경기" value={`${standing.played}`} /><Metric label="승/무/패" value={`${standing.won}/${standing.drawn}/${standing.lost}`} /><Metric label="득점/실점" value={`${standing.goalsFor}/${standing.goalsAgainst}`} /></section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><DataDiffPanel fields={fields} snapshot={providerOperations.snapshot} error={providerOperations.error} /><aside className="rounded-xl border border-border/80 bg-card/40 p-4"><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">순위 직접 수정</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">순위나 승점을 직접 수정하면 외부 데이터로 자동 변경되지 않도록 보호합니다.</p><div className="mt-4"><EntityOverrideControl entityType="standing" entityId={standing.teamId} overrides={providerOperations.overrides} currentValues={currentValue} canEdit={canOverride} openApply={query.action === "override"} defaultReason={reportReferenceReason(query.reportId)} /></div></aside></div>

    <section className="mt-6 rounded-xl border border-border/80 bg-card/40 p-4"><div className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">추가 순위 기록</h2></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="득실차" value={standing.goalDifference} /><Field label="클린시트" value={standing.cleanSheets} /><Field label="평균 점유율" value={standing.averagePossession === null ? null : `${standing.averagePossession}%`} /></dl><details className="mt-4 border-t border-border/60 pt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">기술 식별 정보</summary><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{standing.teamId}</p></details></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-xl border border-border/80 bg-card/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular">{value}</p></article>; }
function Field({ label, value }: { label: string; value: string | number | null }) { return <div className="rounded-lg border border-border bg-background/35 p-3"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 break-all font-mono text-xs">{value ?? "확인 불가"}</dd></div>; }

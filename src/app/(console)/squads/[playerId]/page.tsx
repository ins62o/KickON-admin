import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, Database, GitCompareArrows, History, LockKeyhole, MessageSquareWarning, RefreshCcw, ShieldAlert } from "lucide-react";
import { DataDiffPanel } from "@/components/operations/data-diff-panel";
import { PlayerOverrideControl } from "@/components/players/player-override-control";
import { VerifiedPlayerNameForm } from "@/components/admin/verified-player-name-form";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdminPermission } from "@/lib/auth/server";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { getPlayerData } from "@/lib/data/operations";
import { getPlayerOperations, playerChangeStatusLabels, playerChangeTypeLabels } from "@/lib/data/player-operations";
import { compareEntityValues, getEntityProviderOperations, playerComparableValue } from "@/lib/data/provider-diffs";
import { reportStatusLabel } from "@/lib/data/reports";
import { positionLabel } from "@/lib/football-labels";
import { formatKoreaDateTime, formatRelativeTime } from "@/lib/format";
import { playerChangeSummary } from "@/lib/player-change-display";
import { reportReferenceReason } from "@/lib/report-reference";

export default async function PlayerDetailPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ action?: string; reportId?: string }> }) {
  const [{ playerId }, query] = await Promise.all([params, searchParams]);
  const [admin, result, operations, providerOperations] = await Promise.all([requireAdminPermission("data.read"), getPlayerData(playerId), getPlayerOperations(playerId), getEntityProviderOperations("player", playerId)]);
  if (!result.data) notFound();
  const player = result.data;
  const displayName = player.koreanName ?? player.displayName ?? player.name;
  const activeOverrides = operations.overrides.filter((item) => !item.releasedAt);
  const currentValue = playerComparableValue(player);
  const providerFields = compareEntityValues("player", currentValue, providerOperations.snapshot, providerOperations.overrides);
  const canOverride = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write");

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 py-6 lg:px-6 lg:py-7">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-xs text-muted-foreground"><Link href="/squads"><ArrowLeft className="size-3.5" /> 선수 관리</Link></Button>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1><StatusBadge status={player.inSquad ? "normal" : "unknown"} label={player.inSquad ? "활동" : "확인 필요"} />{activeOverrides.length > 0 ? <Badge variant="outline" className="border-primary/25 bg-primary/[0.06] text-primary"><LockKeyhole className="size-3" /> 직접 수정 보호 {activeOverrides.length}</Badge> : null}</div>
          <p className="mt-1 text-sm text-muted-foreground">{player.name} / {player.teamName} / {positionLabel(player.position)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded-md text-[10px]"><Database className="size-3" /> 외부 축구 데이터 기반</Badge><details><summary className="cursor-pointer text-[10px] text-muted-foreground">선수 식별 정보</summary><p className="mt-1 font-mono text-[9px] text-muted-foreground">{player.id}</p></details></div>
        </div>
        <div className="flex flex-wrap gap-2 self-start"><Button asChild variant="outline"><a href="#data-comparison"><GitCompareArrows className="size-4" /> 외부 값과 비교</a></Button><Button asChild variant="outline"><Link href={`/sync?operation=team-squad&teamId=${encodeURIComponent(player.teamId)}`}><RefreshCcw className="size-4" /> 소속 구단 선수단 새로고침</Link></Button></div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="등번호" value={player.shirtNumber === null ? "확인 불가" : `${player.shirtNumber}번`} /><Metric label="출전" value={`${player.appearances}경기`} /><Metric label="득점" value={`${player.goals}골`} /><Metric label="도움" value={`${player.assists}개`} /></section>
      {operations.error ? <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-100/75"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" /><div><p className="font-medium text-amber-100">{operations.schemaReady ? "운영 데이터 조회 확인 필요" : "운영 데이터 연결 필요"}</p><p className="mt-0.5">{operations.error}</p></div></div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card/40"><div className="border-b border-border/70 px-4 py-3.5"><h2 className="text-sm font-semibold">선수 기본 정보</h2></div><dl className="grid sm:grid-cols-2"><Detail label="한글명" value={player.koreanName ?? "확인 불가"} /><Detail label="원문 이름" value={player.name} /><Detail label="소속 구단" value={player.teamName} /><Detail label="포지션" value={`${positionLabel(player.position)}${player.detailedPosition ? ` / ${player.detailedPosition}` : ""}`} /><Detail label="생년월일" value={player.dateOfBirth ?? "확인 불가"} /><Detail label="나이" value={player.age === null ? "확인 불가" : `${player.age}세`} /><Detail label="신장 / 체중" value={`${player.height ? `${player.height}cm` : "확인 불가"} / ${player.weight ? `${player.weight}kg` : "확인 불가"}`} /><Detail label="국적" value="저장된 정보 없음" /><Detail label="가입일" value="저장된 정보 없음" /><Detail label="마지막 업데이트" value={formatKoreaDateTime(player.updatedAt)} /></dl></section>

          <div id="data-comparison" className="scroll-mt-20"><DataDiffPanel fields={providerFields} snapshot={providerOperations.snapshot} error={providerOperations.error} /></div>

          <section className="rounded-xl border border-border/80 bg-card/40"><SectionHeader icon={GitCompareArrows} title="최근 선수 변동" detail="새로고침 전후 값과 검토 상태" /><div className="divide-y divide-border/60">{operations.changes.length > 0 ? operations.changes.map((change) => <article key={change.id} className="flex items-center gap-3 px-4 py-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border"><GitCompareArrows className="size-3.5 text-muted-foreground" /></div><div className="min-w-0"><p className="text-xs font-medium">{playerChangeTypeLabels[change.changeType]} · {playerChangeStatusLabels[change.reviewStatus]}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{playerChangeSummary(change)}</p></div><span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">{formatRelativeTime(change.detectedAt)}</span></article>) : <Empty text="발견된 선수 변동이 없습니다." />}</div></section>

          <section className="rounded-xl border border-border/80 bg-card/40"><SectionHeader icon={MessageSquareWarning} title="사용자 제보" detail="이 선수와 직접 연결된 제보" /><div className="divide-y divide-border/60">{operations.reports.length > 0 ? operations.reports.map((report) => <article key={report.id} className="flex items-center gap-3 px-4 py-3"><MessageSquareWarning className="size-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="truncate text-xs font-medium">{report.description}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{reportStatusLabel(report.status)} · {formatKoreaDateTime(report.createdAt)}</p></div></article>) : <Empty text="연결된 사용자 제보가 없습니다." />}</div></section>

          <section className="rounded-xl border border-border/80 bg-card/40"><SectionHeader icon={History} title="운영자 변경 이력" detail="직접 변경한 최근 기록" /><div className="divide-y divide-border/60">{operations.audits.length > 0 ? operations.audits.map((audit) => <Link key={audit.id} href={`/audit/${audit.id}`} className="flex gap-3 px-4 py-3 hover:bg-muted/25"><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs font-medium">{auditActionLabel(audit.action)} · {auditEntityLabel(audit.entityType)}</p><p className="mt-1 text-xs text-muted-foreground">{audit.reason ?? "사유 없음"}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{formatKoreaDateTime(audit.createdAt)}</p></div><ArrowRight className="ml-auto size-3.5 self-center text-muted-foreground" /></Link>) : <Empty text="이 선수의 운영 변경 기록이 없습니다." />}</div></section>
        </main>

        <aside className="space-y-4">
          {canOverride ? <section className="rounded-xl border border-border/80 bg-card/40 p-4"><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">검증된 한글 이름</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">검증명은 선수·라인업 표시에 전파되고 다음 동기화에서도 유지됩니다.</p><div className="mt-4"><VerifiedPlayerNameForm playerId={player.id} currentName={player.koreanName} /></div></section> : null}
          <section className="rounded-xl border border-border/80 bg-card/40 p-4"><div className="flex items-center gap-2"><LockKeyhole className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">선수 정보 직접 수정</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">직접 수정한 항목은 외부 데이터 새로고침으로 자동 변경되지 않도록 보호합니다.</p><div className="mt-4"><PlayerOverrideControl playerId={player.id} overrides={operations.overrides} canEdit={canOverride} openApply={query.action === "override"} defaultReason={reportReferenceReason(query.reportId)} /></div></section>
          <section className="rounded-xl border border-border/80 bg-card/40 p-4"><div className="flex items-center gap-2"><ShieldAlert className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">운영 데이터 상태</h2></div><ul className="mt-4 space-y-3 text-xs"><StateRow label="현재 앱 데이터" value="연결됨" /><StateRow label="외부 비교 데이터" value={providerOperations.snapshot ? formatRelativeTime(providerOperations.snapshot.fetchedAt) : "연결 필요"} /><StateRow label="사용자 제보" value={operations.schemaReady ? `${operations.reports.length}건` : "연결 필요"} /><StateRow label="직접 수정 보호" value={operations.schemaReady ? `${activeOverrides.length}개` : "연결 필요"} /><StateRow label="변경 이력" value={operations.schemaReady ? `${operations.audits.length}건` : "연결 필요"} /></ul></section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-xl border border-border/80 bg-card/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular">{value}</p></article>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="border-b border-border/60 px-4 py-3.5 sm:odd:border-r"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
function SectionHeader({ icon: Icon, title, detail }: { icon: typeof History; title: string; detail: string }) { return <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3"><Icon className="size-4 text-muted-foreground" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p></div></div>; }
function Empty({ text }: { text: string }) { return <p className="px-4 py-10 text-center text-xs text-muted-foreground">{text}</p>; }
function StateRow({ label, value }: { label: string; value: string }) { return <li className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span>{value}</span></li>; }
function auditActionLabel(value: string) { return ({ create: "추가", insert: "추가", update: "수정", override_apply: "직접 수정", override_release: "수정값 보호 해제", delete: "삭제", status_change: "상태 변경" } as Record<string, string>)[value.toLowerCase()] ?? "기타 작업"; }
function auditEntityLabel(value: string) { return ({ team: "구단", club: "구단", player: "선수", fixture: "경기", standing: "팀 순위", ranking: "개인 순위" } as Record<string, string>)[value.toLowerCase()] ?? "기타 대상"; }

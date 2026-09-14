"use client";

import { CURRENT_SEASON, isLeagueId, leagueLabel } from "@/lib/football/config";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Database, Trophy } from "lucide-react";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { EntityOverrideControl } from "@/components/operations/entity-override-control";
import { TeamPlayersTable } from "@/components/players/team-players-table";
import { Badge } from "@/components/ui/badge";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { useClientData } from "@/lib/client-data";
import { getStandingsData, getTeamPlayersData } from "@/lib/data/operations";
import { getEntityProviderOperations, standingComparableValue } from "@/lib/data/provider-diffs";
import { formatKoreaDateTime } from "@/lib/format";
import { reportReferenceReason } from "@/lib/report-reference";

export default function StandingDetailPage() {
  const admin = useRequiredAdminPermission("data.read");
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId") ?? "";
  const requestedLeague = searchParams.get("leagueId");
  const league = isLeagueId(requestedLeague) ? requestedLeague : "all";
  const season = Number(searchParams.get("season") ?? CURRENT_SEASON);
  const { data, error, loading, reload } = useClientData(async () => {
    if (requestedLeague && requestedLeague !== "all" && !isLeagueId(requestedLeague)) throw new Error("지원하지 않는 리그입니다.");
    if (!Number.isInteger(season) || season < 2000 || season > 2200) throw new Error("시즌을 확인해 주세요.");
    const standings = await getStandingsData(league, season);
    if (standings.error) throw new Error(standings.error);
    const matches = standings.data.filter((team) => team.teamId === teamId);
    if (matches.length !== 1 || !isLeagueId(matches[0].leagueId)) throw new Error("해당 시즌·리그의 구단을 목록에서 다시 선택해 주세요.");
    const actualLeague = matches[0].leagueId;
    const [players, operations] = await Promise.all([
      getTeamPlayersData(teamId, actualLeague, season),
      getEntityProviderOperations("standing", teamId, season, actualLeague),
    ]);
    return { standings, players, operations };
  }, [teamId, league, season]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "팀 데이터를 확인할 수 없습니다."} retry={reload} />;
  const { standings, players, operations } = data;
  const standing = standings.data.find((row) => row.teamId === teamId);
  if (!standing) return <ClientPageError message="팀을 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;
  const query = {
    action: searchParams.get("action") ?? undefined,
    reportId: searchParams.get("reportId") ?? undefined,
  };
  const currentValue = standingComparableValue(standing);
  const canOverride = !admin.isDevelopmentBypass && ["admin", "super_admin"].includes(admin.role);

  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5"><div className="flex min-w-0 flex-1 items-center gap-3 sm:items-start sm:gap-5"><div className="relative size-14 shrink-0 sm:size-16">{standing.logoPath ? <Image src={standing.logoPath} alt={`${standing.teamName} 로고`} fill sizes="(max-width: 639px) 56px, 64px" className="object-contain" priority /> : <span className="flex size-full items-center justify-center rounded-xl border border-border/80 bg-card/40"><Trophy className="size-6 text-muted-foreground" /></span>}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-tight">{standing.teamName}</h1><Badge variant="outline">{standing.season} 시즌 · {leagueLabel(standing.leagueId)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">마지막 업데이트 {formatKoreaDateTime(standing.updatedAt)}</p></div></div><div className="w-full sm:w-80"><EntityOverrideControl entityType="standing" entityId={standing.teamId} season={standing.season} leagueId={standing.leagueId} overrides={operations.overrides} currentValues={currentValue} canEdit={canOverride} openApply={query.action === "override"} defaultReason={reportReferenceReason(query.reportId)} triggerLabel="팀 수정" dialogTitle="팀 수정" dialogDescription={false} submitLabel="저장" triggerClassName="h-11 w-full px-5 font-bold" showTriggerIcon={false} showSubmitIcon={false} showEmptyOverrides={false} /></div></header>

    <section className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70 sm:mt-6 sm:gap-3 sm:overflow-visible sm:border-0 sm:bg-transparent xl:grid-cols-5"><Metric label="현재 순위" value={`${standing.rank}위`} /><Metric label="승점" value={`${standing.points}점`} /><Metric label="경기" value={`${standing.played}`} /><Metric label="승/무/패" value={`${standing.won}/${standing.drawn}/${standing.lost}`} /><Metric label="득점/실점" value={`${standing.goalsFor}/${standing.goalsAgainst}`} className="col-span-2 sm:col-span-1" /></section>

    <section className="mt-5 overflow-hidden rounded-xl border border-border/80 bg-card/40 sm:mt-6 sm:p-5"><div className="flex items-center gap-2 px-4 py-4 sm:px-0 sm:py-0"><Database className="size-5 text-muted-foreground" /><h2 className="text-base font-semibold sm:text-lg">추가 순위 기록</h2></div><dl className="grid grid-cols-3 gap-px border-t border-border/70 bg-border/70 sm:mt-5 sm:grid-cols-2 sm:gap-3 sm:border-0 sm:bg-transparent lg:grid-cols-3"><Field label="득실차" value={standing.goalDifference} /><Field label="클린시트" value={standing.cleanSheets} /><Field label="평균 점유율" value={standing.averagePossession === null ? null : `${standing.averagePossession}%`} /></dl></section>

    {operations.error ? <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-3 text-sm text-amber-100/75"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />{operations.error}</div> : null}
    {players.error ? <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-5 py-3 text-sm text-amber-100/75"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />선수 구성원을 모두 불러오지 못했습니다.</div> : null}
    <TeamPlayersTable players={players.data} />
  </div>;
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) { return <article className={`flex min-h-28 flex-col justify-between bg-card/70 p-3.5 sm:min-h-0 sm:rounded-xl sm:border sm:border-border/80 sm:bg-card/40 sm:p-4 ${className ?? ""}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-4 pb-1 text-xl font-bold tabular sm:mt-2 sm:pb-0 sm:font-semibold">{value}</p></article>; }
function Field({ label, value }: { label: string; value: string | number | null }) { return <div className="min-w-0 bg-card/70 p-3.5 sm:rounded-lg sm:border sm:border-border sm:bg-background/35 sm:p-4"><dt className="min-h-8 text-[11px] leading-4 text-muted-foreground sm:min-h-0 sm:text-xs">{label}</dt><dd className="mt-3 break-words pb-1 text-base font-bold tabular sm:mt-1.5 sm:pb-0 sm:font-semibold">{value ?? "확인 불가"}</dd></div>; }

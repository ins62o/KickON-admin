"use client";

import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PageHeader } from "@/components/admin/page-header";
import { EntityOverrideControl } from "@/components/operations/entity-override-control";
import { ScheduleCards } from "@/components/fixtures/schedule-table";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { getFixtureData, getStadiumsData } from "@/lib/data/operations";
import { fixtureComparableValue, getEntityProviderOperations } from "@/lib/data/provider-diffs";
import { isLeagueId, leagueLabel } from "@/lib/football/config";

export default function FixtureDetailPage() {
  const admin = useRequiredAdminPermission("data.read");
  const params = useSearchParams();
  const id = params.get("fixtureId") ?? "";
  const requestedLeague = params.get("leagueId");
  const { data, error, loading, reload } = useClientData(async () => {
    if (requestedLeague && !isLeagueId(requestedLeague)) throw new Error("지원하지 않는 리그입니다.");
    const [result, stadiums] = await Promise.all([getFixtureData(id, isLeagueId(requestedLeague) ? requestedLeague : "all"), getStadiumsData()]);
    if (result.error) throw new Error(result.error);
    const fixture = result.data;
    if (!fixture || !isLeagueId(fixture.leagueId)) throw new Error("해당 리그의 경기를 찾을 수 없습니다.");
    const season = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date(fixture.kickoffAt)));
    const operations = await getEntityProviderOperations("fixture", id, season, fixture.leagueId);
    return { fixture, stadiums, operations, season };
  }, [id, requestedLeague]);
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !data) return <ClientPageError message={error ?? "경기를 확인할 수 없습니다."} retry={reload} />;
  const { fixture, stadiums, operations, season } = data;
  const canEdit = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write");
  const canOverride = canEdit && ["admin", "super_admin"].includes(admin.role);
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6">
    <PageHeader title={`${fixture.homeTeamName} vs ${fixture.awayTeamName}`} description={`${season} · ${leagueLabel(fixture.leagueId)} · ${fixture.id}`} />
    {operations.error || stadiums.error ? <p role="alert" className="mt-4 text-sm text-warning">{operations.error ?? stadiums.error}</p> : null}
    <div className="mt-5"><EntityOverrideControl entityType="fixture" entityId={fixture.id} leagueId={fixture.leagueId} season={season} overrides={operations.overrides} currentValues={fixtureComparableValue(fixture)} canEdit={canOverride} triggerLabel="점수·경기 상태 수정" showActiveOverrides={false} /></div>
    <ScheduleCards fixtures={[fixture]} stadiums={stadiums.data} overrides={new Map([[fixture.id, operations.overrides]])} canEdit={canEdit} />
    <section className="mt-5 rounded-xl border border-border p-5"><h2 className="text-lg font-semibold">라인업</h2>
      {fixture.lineupPlayers.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{fixture.lineupPlayers.map((player) => <li key={`${player.teamId}:${player.playerId}:${player.role}`} className="text-sm">{player.teamId === fixture.homeTeamId ? fixture.homeTeamName : fixture.awayTeamName} · {player.shirtNumber ?? "-"} · {player.koreanName ?? player.name} · {player.role === "STARTER" ? "선발" : "후보"}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">등록된 라인업이 없습니다.</p>}
    </section>
  </div>;
}

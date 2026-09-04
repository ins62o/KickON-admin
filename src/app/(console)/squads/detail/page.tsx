"use client";

import { useSearchParams } from "next/navigation";
import { ClientPageError, ClientPageLoading } from "@/components/admin/client-page-state";
import { PlayerOverrideControl } from "@/components/players/player-override-control";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { hasAdminPermission } from "@/lib/auth/permissions";
import { useClientData } from "@/lib/client-data";
import { teamNames } from "@/lib/data/catalog";
import { getPlayerData } from "@/lib/data/operations";
import { positionLabel } from "@/lib/football-labels";
import { reportReferenceReason } from "@/lib/report-reference";

const playerUpdatedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default function PlayerDetailPage() {
  const admin = useRequiredAdminPermission("data.read");
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId") ?? "";
  const { data: result, error, loading, reload } = useClientData(
    () => getPlayerData(playerId),
    [playerId],
  );
  if (!admin || loading) return <ClientPageLoading />;
  if (error || !result) return <ClientPageError message={error ?? "선수 데이터를 확인할 수 없습니다."} retry={reload} />;
  if (!result.data) return <ClientPageError message="선수를 찾을 수 없습니다. 목록에서 다시 선택해 주세요." retry={reload} />;
  const player = result.data;
  const query = {
    action: searchParams.get("action") ?? undefined,
    reportId: searchParams.get("reportId") ?? undefined,
  };
  const displayName = player.koreanName ?? player.displayName ?? player.name;
  const canOverride = !admin.isDevelopmentBypass && hasAdminPermission(admin.role, "data.write");

  return (
    <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{player.name} / {player.teamName} / {positionLabel(player.position)}</p>
        </div>
        <div className="self-start"><PlayerOverrideControl player={{ id: player.id, season: player.season, leagueId: player.leagueId, teamId: player.teamId, name: player.name, koreanName: player.koreanName, shirtNumber: player.shirtNumber, position: player.position, appearances: player.appearances, goals: player.goals, assists: player.assists, height: player.height, weight: player.weight, dateOfBirth: player.dateOfBirth }} teams={Object.entries(teamNames).map(([id, name]) => ({ id, name }))} canEdit={canOverride} openApply={query.action === "override"} defaultReason={reportReferenceReason(query.reportId)} /></div>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="등번호" value={player.shirtNumber === null ? "확인 불가" : `${player.shirtNumber}번`} /><Metric label="출전" value={`${player.appearances}경기`} /><Metric label="득점" value={`${player.goals}골`} /><Metric label="도움" value={`${player.assists}개`} /></section>

      <main className="mt-6 space-y-6">
        <section className="rounded-xl border border-border/80 bg-card/40"><div className="border-b border-border/70 px-5 py-4"><h2 className="text-lg font-semibold">선수 기본 정보</h2></div><dl className="grid sm:grid-cols-2"><Detail label="한국 이름" value={player.koreanName ?? "확인 불가"} /><Detail label="영어 이름" value={player.name} /><Detail label="소속 구단" value={player.teamName} /><Detail label="포지션" value={positionLabel(player.position)} /><Detail label="생년월일" value={formatPlayerBirthDate(player.dateOfBirth)} /><Detail label="나이" value={player.age === null ? "확인 불가" : `${player.age}세`} /><Detail label="신장 / 체중" value={`${player.height ? `${player.height}cm` : "확인 불가"} / ${player.weight ? `${player.weight}kg` : "확인 불가"}`} /><Detail label="국적" value="저장된 정보 없음" /><Detail label="가입일" value="저장된 정보 없음" /><Detail label="마지막 업데이트" value={formatPlayerUpdatedAt(player.updatedAt)} /></dl></section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <article className="rounded-xl border border-border/80 bg-card/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular">{value}</p></article>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="border-b border-border/60 px-5 py-5 sm:odd:border-r"><dt className="text-sm font-medium text-muted-foreground">{label}</dt><dd className="mt-2 text-base font-medium">{value}</dd></div>; }

function formatPlayerBirthDate(value: string | null) {
  if (!value) return "확인 불가";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatPlayerUpdatedAt(value: string | null) {
  if (!value) return "확인 불가";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인 불가";

  const parts = Object.fromEntries(
    playerUpdatedAtFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${hour < 12 ? "오전" : "오후"} ${parts.hour}시 ${parts.minute}분`;
}

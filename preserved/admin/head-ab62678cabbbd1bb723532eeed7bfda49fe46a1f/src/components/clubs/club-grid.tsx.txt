"use client";

import { useState } from "react";
import type { ClubSummary } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { ClubCard } from "./club-card";

const filters = ["전체", "K리그1", "K리그2", "데이터 문제 있음", "사용자 제보 있음", "최근 선수 변동 있음"] as const;

export function ClubGrid({ clubs }: { clubs: ClubSummary[] }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("전체");
  const reportsUnavailable = clubs.every((club) => club.reportCount === null);
  const changesUnavailable = clubs.every((club) => club.changeCount === null);
  const divisionsUnavailable = clubs.every((club) => club.division === null);
  const visibleClubs = clubs.filter((club) => {
    if (filter === "데이터 문제 있음") return club.status === "warning" || club.status === "danger";
    if (filter === "사용자 제보 있음") return (club.reportCount ?? 0) > 0;
    if (filter === "최근 선수 변동 있음") return (club.changeCount ?? 0) > 0;
    if (filter === "K리그1" || filter === "K리그2") return club.division === filter;
    return true;
  });
  const isDisabled = (item: (typeof filters)[number]) =>
    (item === "사용자 제보 있음" && reportsUnavailable)
    || (item === "최근 선수 변동 있음" && changesUnavailable)
    || ((item === "K리그1" || item === "K리그2") && divisionsUnavailable);
  const disabledReason = (item: (typeof filters)[number]) => {
    if (item === "사용자 제보 있음" && reportsUnavailable) return "사용자 제보 운영 데이터가 아직 연결되지 않았습니다.";
    if (item === "최근 선수 변동 있음" && changesUnavailable) return "선수 변동 스냅샷이 아직 연결되지 않았습니다.";
    if ((item === "K리그1" || item === "K리그2") && divisionsUnavailable) return "현재 리그 구분 데이터가 없습니다.";
    return undefined;
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {filters.map((item) => (
          <Button key={item} variant={filter === item ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter(item)} disabled={isDisabled(item)} title={disabledReason(item)} aria-pressed={filter === item}>
            {item}
          </Button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground" aria-live="polite">{visibleClubs.length}개 구단</span>
      </div>
      {visibleClubs.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleClubs.map((club) => <ClubCard key={club.id} club={club} />)}
        </div>
      ) : (
        <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">조건에 맞는 구단이 없습니다.</div>
      )}
    </>
  );
}

"use client";

import { CURRENT_SEASON } from "@/lib/football/config";
import Image from "next/image";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleCheck, MapPin, Navigation, Search, SlidersHorizontal, UsersRound } from "lucide-react";
import { ScheduleDateTimePicker } from "@/components/fixtures/schedule-date-time-picker";
import { TeamSelectOptions } from "@/components/admin/team-select-options";
import { EntityOverrideControl } from "@/components/operations/entity-override-control";
import { StatusBadge } from "@/components/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fixtureStatusLabels, getTeamLogoPath } from "@/lib/data/catalog";
import type { FixtureRecord, StadiumRecord } from "@/lib/data/types";
import { fixtureComparableValue, type EntityOverrideRecord } from "@/lib/data/provider-diffs";
import { updateFixtureScheduleAction, type OperationActionState } from "@/lib/operations/actions";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };
const pageSize = 18;
const triggerClass = "h-12! w-full rounded-xl border-border/80 bg-background/75 px-3.5 shadow-sm transition-colors hover:border-primary/45 hover:bg-muted/35 sm:w-44";
const contentClass = "rounded-xl border border-border/80 bg-popover/98 p-1.5 shadow-2xl backdrop-blur-xl";
const itemClass = "my-0.5 min-h-10 cursor-pointer rounded-lg px-3 py-2 pr-9 font-medium focus:bg-primary/12 focus:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary";

const fixtureStatusVisual: Record<FixtureRecord["status"], { dotClass: string; badgeClass: string; health: "normal" | "warning" | "danger" | "unknown" }> = {
  SCHEDULED: { dotClass: "bg-emerald-400", badgeClass: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300", health: "normal" },
  LIVE: { dotClass: "bg-red-400", badgeClass: "border-red-400/20 bg-red-400/10 text-red-300", health: "danger" },
  FINISHED: { dotClass: "bg-zinc-400", badgeClass: "border-zinc-500/25 bg-zinc-500/10 text-zinc-400", health: "unknown" },
  CANCELED: { dotClass: "bg-orange-400", badgeClass: "border-orange-400/25 bg-orange-400/10 text-orange-300", health: "warning" },
};

function FixtureStatusOption({ status }: { status: FixtureRecord["status"] }) {
  return <><span className={`size-2 shrink-0 rounded-full ${fixtureStatusVisual[status].dotClass}`} aria-hidden="true" />{fixtureStatusLabels[status]}</>;
}

function koreaDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fixtureDate(value: string) {
  const date = new Date(value);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...options }).format(date);
  return {
    date: part({ month: "long", day: "numeric" }),
    weekday: part({ weekday: "short" }),
    time: part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  };
}

export function ScheduleCards({ fixtures, stadiums, overrides, canEdit }: { fixtures: FixtureRecord[]; stadiums: StadiumRecord[]; overrides: Map<string, EntityOverrideRecord[]>; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [teamId, setTeamId] = useState("all");
  const [page, setPage] = useState(0);
  const stadiumMap = useMemo(() => new Map(stadiums.map((stadium) => [stadium.id, stadium])), [stadiums]);
  const teams = useMemo(() => Array.from(new Map(fixtures.flatMap((fixture) => [
    [fixture.homeTeamId, { id: fixture.homeTeamId, name: fixture.homeTeamName, leagueId: fixture.leagueId }],
    [fixture.awayTeamId, { id: fixture.awayTeamId, name: fixture.awayTeamName, leagueId: fixture.leagueId }],
  ])).values()), [fixtures]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("ko-KR");
    return fixtures.filter((fixture) => {
      const textMatch = !search || [fixture.homeTeamName, fixture.awayTeamName, fixture.stadiumName]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(search));
      return textMatch
        && (status === "all" || fixture.status === status)
        && (teamId === "all" || fixture.homeTeamId === teamId || fixture.awayTeamId === teamId);
    });
  }, [fixtures, query, status, teamId]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const resetPage = () => setPage(0);

  return <div>
    <div className="grid gap-3 border-b border-border/70 bg-muted/10 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_176px_208px_auto] xl:items-center">
      <label className="relative block">
        <span className="sr-only">구단 또는 경기장 검색</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => { setQuery(event.target.value); resetPage(); }}
          placeholder="구단 또는 경기장 검색"
          className="h-12 rounded-xl bg-background/75 pr-4 pl-11 shadow-sm"
        />
      </label>
      <Select value={status} onValueChange={(value) => { setStatus(value); resetPage(); }}>
        <SelectTrigger className={triggerClass} aria-label="경기 상태 필터"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" align="start" className={`${contentClass} max-h-80 w-(--radix-select-trigger-width)`}>
          <SelectItem value="all" className={itemClass}><SlidersHorizontal className="size-4 text-primary" />전체 상태</SelectItem>
          {(Object.keys(fixtureStatusLabels) as FixtureRecord["status"][]).map((value) => <SelectItem key={value} value={value} className={itemClass}><FixtureStatusOption status={value} /></SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={teamId} onValueChange={(value) => { setTeamId(value); resetPage(); }}>
        <SelectTrigger className="h-12! w-full rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 sm:w-52 dark:bg-muted/35 dark:hover:bg-muted/50" aria-label="구단 필터"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" align="start" className="max-h-80 w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
          <SelectItem value="all" className="py-2 pr-8 pl-2.5"><TeamFilterIcon />전체 구단</SelectItem>
          <TeamSelectOptions teams={teams} />
        </SelectContent>
      </Select>
      <p className="text-right text-xs tabular-nums text-muted-foreground">총 <strong className="font-semibold text-foreground">{filtered.length.toLocaleString("ko-KR")}</strong>경기</p>
    </div>

    {visible.length ? <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
      {visible.map((fixture) => <ScheduleCard key={fixture.id} fixture={fixture} stadium={stadiumMap.get(fixture.stadiumId)} stadiums={stadiums} overrides={overrides.get(fixture.id) ?? []} canEdit={canEdit} />)}
    </div> : <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
      <CalendarDays className="size-9 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-semibold">조건에 맞는 경기 일정이 없습니다.</p>
      <p className="mt-1 text-xs text-muted-foreground">검색어나 필터를 변경해 보세요.</p>
    </div>}

    {pageCount > 1 ? <nav className="flex items-center justify-center gap-3 border-t border-border/70 px-4 py-4" aria-label="일정 페이지 이동">
      <Button type="button" variant="outline" className="min-w-24" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>이전</Button>
      <span className="min-w-20 text-center text-xs tabular-nums text-muted-foreground"><strong className="font-semibold text-foreground">{currentPage + 1}</strong> / {pageCount}</span>
      <Button type="button" variant="outline" className="min-w-24" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>다음</Button>
    </nav> : null}
  </div>;
}

function ScheduleCard({ fixture, stadium, stadiums, overrides, canEdit }: { fixture: FixtureRecord; stadium: StadiumRecord | undefined; stadiums: StadiumRecord[]; overrides: EntityOverrideRecord[]; canEdit: boolean }) {
  const date = fixtureDate(fixture.kickoffAt);
  const statusVisual = fixtureStatusVisual[fixture.status];
  return <article className="group flex min-h-96 flex-col overflow-hidden rounded-2xl border border-border/75 bg-background/55 shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-black/10">
    <header className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
      <p className="text-sm font-semibold tabular-nums">{date.date} ({date.weekday}) · {date.time}</p>
      <StatusBadge status={statusVisual.health} label={fixtureStatusLabels[fixture.status]} className={statusVisual.badgeClass} />
    </header>
    <div className="flex flex-1 flex-col p-5">
      <div className="grid min-h-28 grid-cols-[1fr_72px_1fr] items-center gap-3 text-center">
        <TeamIdentity teamId={fixture.homeTeamId} teamName={fixture.homeTeamName} />
        <div className="flex flex-col items-center justify-center">
          <strong className="text-lg leading-none">{fixture.homeScore === null || fixture.awayScore === null ? "VS" : `${fixture.homeScore} : ${fixture.awayScore}`}</strong>
          <span className="mt-2 text-xs text-muted-foreground">{fixture.round === null ? "라운드 미정" : `${fixture.round} 라운드`}</span>
        </div>
        <TeamIdentity teamId={fixture.awayTeamId} teamName={fixture.awayTeamName} />
      </div>
      <div className="mt-5 space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4 text-xs">
        <div className="flex items-center gap-2.5"><MapPin className="size-4 shrink-0 text-primary" /><p className="font-semibold text-foreground">{fixture.stadiumName}</p></div>
        <div className="flex items-start gap-2.5"><Navigation className="mt-0.5 size-4 shrink-0 text-primary" /><p className="leading-relaxed text-muted-foreground">{stadium?.address ?? "주소 정보 없음"}</p></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <ScheduleEditDialog fixture={fixture} stadiums={stadiums} disabled={!canEdit} triggerClassName="h-11! w-full" />
        <EntityOverrideControl entityType="fixture" entityId={fixture.id} leagueId={fixture.leagueId} season={CURRENT_SEASON} overrides={overrides} currentValues={fixtureComparableValue(fixture)} canEdit={canEdit} triggerLabel="경기 관리" triggerVariant="outline" dialogTitle="경기 정보 수정" dialogDescription={false} submitLabel="수정" triggerClassName="h-11! w-full" showTriggerIcon={false} showSubmitIcon={false} showActiveOverrides={false} />
      </div>
      <EntityOverrideControl entityType="fixture" entityId={fixture.id} leagueId={fixture.leagueId} season={CURRENT_SEASON} overrides={overrides} currentValues={fixtureComparableValue(fixture)} canEdit={canEdit} showApplyTrigger={false} showEmptyOverrides={false} />
    </div>
  </article>;
}

function TeamIdentity({ teamId, teamName }: { teamId: string; teamName: string }) {
  const logoPath = getTeamLogoPath(teamId);
  return <div className="flex min-w-0 flex-col items-center">
    <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-white p-1.5 shadow-sm ring-1 ring-border/70">
      {logoPath ? <Image src={logoPath} alt={`${teamName} 엠블럼`} fill sizes="48px" className="object-contain p-1.5" /> : <span className="text-xs font-extrabold text-zinc-700">{teamName.replaceAll(" ", "").slice(0, 2)}</span>}
    </span>
    <strong className="mt-2.5 line-clamp-2 text-sm leading-snug">{teamName}</strong>
  </div>;
}

function TeamFilterIcon({ teamId, teamName }: { teamId?: string; teamName?: string }) {
  const logoPath = teamId ? getTeamLogoPath(teamId) : null;
  if (logoPath) return <Image src={logoPath} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" />;
  return <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
    {teamName ? <span className="text-[8px] font-extrabold">{teamName.replaceAll(" ", "").slice(0, 2)}</span> : <UsersRound className="size-3" />}
  </span>;
}

function ScheduleEditDialog({ fixture, stadiums, disabled, triggerClassName }: { fixture: FixtureRecord; stadiums: StadiumRecord[]; disabled: boolean; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [formSession, setFormSession] = useState(0);
  const handleSuccess = useCallback(() => { setOpen(false); setSuccessOpen(true); }, []);

  return <>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setFormSession((value) => value + 1); }}>
      <DialogTrigger asChild><Button type="button" variant="outline" className={triggerClassName ?? "h-11! w-full"} disabled={disabled}>일정 수정</Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle className="text-xl">경기 일정 수정</DialogTitle><DialogDescription>{fixture.homeTeamName} vs {fixture.awayTeamName}</DialogDescription></DialogHeader>
        <FixtureScheduleForm key={formSession} fixture={fixture} stadiums={stadiums} onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
    <AlertDialog open={successOpen} onOpenChange={setSuccessOpen}>
      <AlertDialogContent>
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400" aria-hidden="true"><CircleCheck className="size-6" /></span>
          <AlertDialogTitle>일정이 변경되었습니다</AlertDialogTitle>
          <AlertDialogDescription>변경한 경기 일시와 위치가 직관 인증에 바로 적용됩니다.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center"><AlertDialogAction className="min-w-24">확인</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}

function FixtureScheduleForm({ fixture, stadiums, onSuccess }: { fixture: FixtureRecord; stadiums: StadiumRecord[]; onSuccess: () => void }) {
  const initialStadium = stadiums.find((stadium) => stadium.id === fixture.stadiumId) ?? stadiums[0];
  const initialKickoff = koreaDateTimeInput(fixture.kickoffAt).split("T");
  const [kickoffDate, setKickoffDate] = useState(initialKickoff[0] ?? "");
  const [kickoffTime, setKickoffTime] = useState(initialKickoff[1] ?? "");
  const [stadiumId, setStadiumId] = useState(initialStadium?.id ?? "");
  const [latitude, setLatitude] = useState(String(fixture.attendanceLatitude ?? initialStadium?.latitude ?? ""));
  const [longitude, setLongitude] = useState(String(fixture.attendanceLongitude ?? initialStadium?.longitude ?? ""));
  const [state, action, pending] = useActionState(updateFixtureScheduleAction, initialState);
  const selectedStadium = stadiums.find((stadium) => stadium.id === stadiumId);

  useEffect(() => { if (state.status === "success" && state.completedAt) onSuccess(); }, [onSuccess, state.completedAt, state.status]);

  const changeStadium = (value: string) => {
    setStadiumId(value);
    const next = stadiums.find((stadium) => stadium.id === value);
    if (next) { setLatitude(String(next.latitude)); setLongitude(String(next.longitude)); }
  };

  return <form action={action} className="mt-2 space-y-5">
    <input type="hidden" name="fixtureId" value={fixture.id} /><input type="hidden" name="leagueId" value={fixture.leagueId} />
    <input type="hidden" name="kickoffAt" value={`${kickoffDate}T${kickoffTime}`} />
    <div className="space-y-2.5">
      <p className="text-sm font-semibold">경기 날짜 및 시간</p>
      <ScheduleDateTimePicker id={`fixture-kickoff-${fixture.id}`} date={kickoffDate} time={kickoffTime} onDateChange={setKickoffDate} onTimeChange={setKickoffTime} />
    </div>
    <div className="space-y-2.5">
      <label htmlFor={`fixture-stadium-${fixture.id}`} className="block text-sm font-semibold">경기장</label>
      <Select name="stadiumId" value={stadiumId} onValueChange={changeStadium} required>
        <SelectTrigger id={`fixture-stadium-${fixture.id}`} className="h-14! w-full rounded-xl border-primary/25 bg-primary/5 px-3.5 hover:border-primary/50">
          <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left"><MapPin className="size-4 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{selectedStadium?.name ?? "경기장 선택"}</span>{selectedStadium?.address ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{selectedStadium.address}</span> : null}</span></span>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className={`${contentClass} max-h-80 w-(--radix-select-trigger-width)`}>
          {stadiums.map((stadium) => <SelectItem key={stadium.id} value={stadium.id} className={`${itemClass} min-h-12`}><span className="flex min-w-0 flex-col items-start"><span>{stadium.name}</span>{stadium.address ? <span className="max-w-96 truncate text-xs font-normal text-muted-foreground">{stadium.address}</span> : null}</span></SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="rounded-xl border border-border/80 bg-muted/25 p-4">
      <div className="flex items-center gap-2"><Navigation className="size-4 text-primary" /><p className="text-sm font-semibold">직관 인증 좌표</p></div>
      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/45 p-3.5">
        <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{selectedStadium?.name ?? "경기장 선택"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{selectedStadium?.address ?? "주소 정보 없음"}</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><label htmlFor={`fixture-latitude-${fixture.id}`} className="text-xs font-medium">위도</label><Input id={`fixture-latitude-${fixture.id}`} name="latitude" type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} required className="h-12 rounded-xl px-3.5" /></div>
        <div className="space-y-2"><label htmlFor={`fixture-longitude-${fixture.id}`} className="text-xs font-medium">경도</label><Input id={`fixture-longitude-${fixture.id}`} name="longitude" type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} required className="h-12 rounded-xl px-3.5" /></div>
      </div>
    </div>
    <div className="space-y-2.5"><label htmlFor={`fixture-reason-${fixture.id}`} className="block text-sm font-semibold">수정 이유</label><Textarea id={`fixture-reason-${fixture.id}`} name="reason" minLength={3} maxLength={1000} required className="min-h-24 rounded-xl px-3.5 py-3" placeholder="예: 경기 일정 및 경기장 변경" /></div>
    {state.status === "error" && state.message ? <p role="alert" className="text-xs text-rose-300">{state.message}</p> : null}
    <DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline" className="px-5" disabled={pending}>취소</Button></DialogClose><Button type="submit" className="px-6" disabled={pending || !stadiumId}>{pending ? "저장 중" : "일정 저장"}</Button></DialogFooter>
  </form>;
}

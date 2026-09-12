"use client";

import { CURRENT_SEASON, SUPPORTED_LEAGUES } from "@/lib/football/config";
import Image from "next/image";
import { useActionState, useState } from "react";
import { MapPin, UsersRound } from "lucide-react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamSelectOptions } from "@/components/admin/team-select-options";
import { Textarea } from "@/components/ui/textarea";
import { createManualPlayerAction, initialAdminActionState } from "@/lib/admin/actions";
import { getTeamLogoPath } from "@/lib/data/catalog";

const positions = [
  { value: "Goalkeeper", label: "골키퍼", dot: "bg-yellow-400" },
  { value: "Defender", label: "수비수", dot: "bg-blue-500" },
  { value: "Midfielder", label: "미드필더", dot: "bg-emerald-500" },
  { value: "Attacker", label: "공격수", dot: "bg-red-500" },
];

export function ManualPlayerForm({ teams }: { teams: Array<{ id: string; name: string; leagueId: string }> }) {
  const [state, action] = useActionState(createManualPlayerAction, initialAdminActionState);
  const [leagueId, setLeagueId] = useState("");
  const leagueTeams = teams.filter((team) => team.leagueId === leagueId);
  const [teamId, setTeamId] = useState("");
  const selectedTeam = leagueTeams.find((team) => team.id === teamId);
  const selectedTeamLogo = selectedTeam ? getTeamLogoPath(selectedTeam.id) : null;
  return <form action={action} className="mt-2 grid gap-x-5 gap-y-6 sm:grid-cols-2">
    <input type="hidden" name="season" value={CURRENT_SEASON} />
    <FormField label="리그" htmlFor="manual-player-league" className="sm:col-span-2">
      <Select name="leagueId" value={leagueId} onValueChange={(value) => { setLeagueId(value); setTeamId(""); }} required>
        <SelectTrigger id="manual-player-league" className="w-full"><SelectValue placeholder="리그 먼저 선택" /></SelectTrigger>
        <SelectContent>{SUPPORTED_LEAGUES.map((league) => <SelectItem key={league.id} value={league.id}>{league.label}</SelectItem>)}</SelectContent>
      </Select>
      {leagueId && leagueTeams.length === 0 ? <p className="text-sm text-muted-foreground">등록된 {SUPPORTED_LEAGUES.find((league) => league.id === leagueId)?.label} 데이터가 없습니다</p> : null}
    </FormField>
    <FormField label="소속 팀" htmlFor="manual-player-team">
      <Select name="teamId" disabled={!leagueId || leagueTeams.length === 0} value={teamId} onValueChange={setTeamId} required>
        <SelectTrigger id="manual-player-team" className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><span className="flex min-w-0 flex-1 items-center gap-2 text-left">{selectedTeamLogo ? <Image src={selectedTeamLogo} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" /> : <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true"><UsersRound className="size-3" /></span>}<span className="truncate text-foreground">{selectedTeam?.name ?? "팀 선택"}</span></span></SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
          <TeamSelectOptions teams={leagueTeams} itemClassName="py-2.5" />
        </SelectContent>
      </Select>
    </FormField>
    <FormField label="포지션" htmlFor="manual-player-position">
      <Select name="position" defaultValue="__none">
        <SelectTrigger id="manual-player-position" className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><SelectValue placeholder="포지션 선택" /></SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
          <SelectItem value="__none" className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary"><MapPin className="size-3" /></span>포지션 미지정</SelectItem>
          {positions.map((position) => <SelectItem key={position.value} value={position.value} className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className={`size-2 shrink-0 rounded-full ${position.dot}`} aria-hidden="true" />{position.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </FormField>
    <FormField label="영어 이름" htmlFor="manual-player-name"><Input id="manual-player-name" name="playerName" required maxLength={120} className="h-11 rounded-xl px-3.5 text-sm" /></FormField>
    <FormField label="한국 이름" htmlFor="manual-player-name-ko"><Input id="manual-player-name-ko" name="displayNameKo" maxLength={120} className="h-11 rounded-xl px-3.5 text-sm" /></FormField>
    <FormField label="등번호" htmlFor="manual-player-number" className="sm:col-span-2"><Input id="manual-player-number" name="shirtNumber" type="number" min={0} max={999} className="h-11 rounded-xl px-3.5 text-sm" /></FormField>
    <FormField label="등록 사유" htmlFor="manual-player-reason" className="sm:col-span-2"><Textarea id="manual-player-reason" name="reason" required minLength={3} maxLength={1000} rows={4} className="min-h-28 rounded-xl px-3.5 py-3 text-sm" placeholder="내용을 입력하세요." /></FormField>
    <div className="sm:col-span-2">{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-sm text-danger" : "text-sm text-success"}>{state.message}</p> : null}<div className="mt-4 flex justify-end"><ActionSubmit className="h-11 px-6 text-sm">선수 등록</ActionSubmit></div></div>
  </form>;
}

function FormField({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return <div className={`space-y-2.5 ${className ?? ""}`}><label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">{label}</label>{children}</div>;
}

export function ManualPlayerDialog({ teams }: { teams: Array<{ id: string; name: string; leagueId: string }> }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-11 min-w-32 px-6 text-base">선수 등록</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="gap-2 pb-1">
          <DialogTitle className="text-xl">선수 등록</DialogTitle>
        </DialogHeader>
        <ManualPlayerForm teams={teams} />
      </DialogContent>
    </Dialog>
  );
}

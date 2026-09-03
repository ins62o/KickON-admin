"use client";

import Image from "next/image";
import { useActionState, useState, type ReactNode } from "react";
import { MapPin, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTeamLogoPath } from "@/lib/data/catalog";
import { updatePlayerDetailsAction, type OperationActionState } from "@/lib/operations/actions";
import type { PlayerRecord } from "@/lib/data/types";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };
const positions = [
  { value: "Goalkeeper", label: "골키퍼", dot: "bg-yellow-400" },
  { value: "Defender", label: "수비수", dot: "bg-blue-500" },
  { value: "Midfielder", label: "미드필더", dot: "bg-emerald-500" },
  { value: "Attacker", label: "공격수", dot: "bg-red-500" },
];

type EditablePlayer = Pick<PlayerRecord,
  "id" | "season" | "leagueId" | "teamId" | "name" | "koreanName" | "shirtNumber" | "position" |
  "appearances" | "goals" | "assists" | "height" | "weight" | "dateOfBirth"
>;
type TeamOption = { id: string; name: string };

export function PlayerOverrideControl({ player, teams, canEdit, openApply = false, defaultReason = "" }: { player: EditablePlayer; teams: TeamOption[]; canEdit: boolean; openApply?: boolean; defaultReason?: string }) {
  return <PlayerEditDialog player={player} teams={teams} canEdit={canEdit} open={openApply && canEdit} defaultReason={defaultReason} />;
}

function PlayerEditDialog({ player, teams, canEdit, open, defaultReason }: { player: EditablePlayer; teams: TeamOption[]; canEdit: boolean; open: boolean; defaultReason: string }) {
  const [state, action, pending] = useActionState(updatePlayerDetailsAction, initialState);
  const [teamId, setTeamId] = useState(player.teamId);
  const [position, setPosition] = useState(player.position ?? "__none");
  const selectedTeam = teams.find((team) => team.id === teamId);
  const selectedTeamLogo = selectedTeam ? getTeamLogoPath(selectedTeam.id) : null;
  const selectedPosition = positions.find((item) => item.value === position);

  return (
    <Dialog defaultOpen={open}>
      <DialogTrigger asChild><Button className="h-10 px-5 font-bold" disabled={!canEdit}>선수 정보 수정</Button></DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"><DialogHeader className="pb-1"><DialogTitle className="text-xl">선수 정보 수정</DialogTitle></DialogHeader>
        <form action={action} className="mt-2 space-y-6">
          <input type="hidden" name="playerId" value={player.id} />
          <input type="hidden" name="season" value={player.season} />
          <input type="hidden" name="leagueId" value={player.leagueId} />
          <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
            <Field label="영어 이름" htmlFor="player-name"><Input id="player-name" name="playerName" defaultValue={player.name} maxLength={160} required className="h-11 rounded-xl px-3.5 text-sm" /></Field>
            <Field label="한국 이름" htmlFor="player-name-ko"><Input id="player-name-ko" name="displayNameKo" defaultValue={player.koreanName ?? ""} maxLength={160} className="h-11 rounded-xl px-3.5 text-sm" placeholder="없음" /></Field>
            <Field label="소속 구단" htmlFor="player-team">
              <Select name="teamId" value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="player-team" className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><span className="flex min-w-0 flex-1 items-center gap-2 text-left">{selectedTeamLogo ? <Image src={selectedTeamLogo} width={20} height={20} alt="" className="size-5 shrink-0 object-contain" /> : <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true"><UsersRound className="size-3" /></span>}<span className="truncate text-foreground">{selectedTeam?.name ?? "팀 선택"}</span></span></SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                  {teams.map((team) => {
                    const logoPath = getTeamLogoPath(team.id);
                    return <SelectItem key={team.id} value={team.id} className="cursor-pointer py-2.5 pr-8 pl-2.5">{logoPath ? <Image src={logoPath} width={20} height={20} alt="" className="size-5 object-contain" /> : <span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary"><UsersRound className="size-3" /></span>}{team.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="등번호" htmlFor="player-shirt-number"><Input id="player-shirt-number" name="shirtNumber" type="number" min={0} max={999} defaultValue={player.shirtNumber ?? ""} placeholder="없음" className="h-11 rounded-xl px-3.5 text-sm" /></Field>
            <Field label="포지션" htmlFor="player-position">
              <Select name="position" value={position} onValueChange={setPosition}>
                <SelectTrigger id="player-position" className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><span className="flex min-w-0 flex-1 items-center gap-2 text-left">{selectedPosition ? <span className={`size-2 shrink-0 rounded-full ${selectedPosition.dot}`} aria-hidden="true" /> : <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true"><MapPin className="size-3" /></span>}<span className="truncate text-foreground">{selectedPosition?.label ?? "포지션 미지정"}</span></span></SelectTrigger>
                <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">
                  <SelectItem value="__none" className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary"><MapPin className="size-3" /></span>포지션 미지정</SelectItem>
                  {positions.map((item) => <SelectItem key={item.value} value={item.value} className="cursor-pointer py-2.5 pr-8 pl-2.5"><span className={`size-2 shrink-0 rounded-full ${item.dot}`} aria-hidden="true" />{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="생년월일" htmlFor="player-date-of-birth"><Input id="player-date-of-birth" name="dateOfBirth" type="date" defaultValue={player.dateOfBirth ?? ""} className="h-11 rounded-xl px-3.5 text-sm dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:brightness-0 dark:[&::-webkit-calendar-picker-indicator]:invert" /></Field>
            <Field label="신장 (cm)" htmlFor="player-height"><Input id="player-height" name="height" type="number" min={50} max={300} defaultValue={player.height ?? ""} placeholder="없음" className="h-11 rounded-xl px-3.5 text-sm" /></Field>
            <Field label="체중 (kg)" htmlFor="player-weight"><Input id="player-weight" name="weight" type="number" min={20} max={300} defaultValue={player.weight ?? ""} placeholder="없음" className="h-11 rounded-xl px-3.5 text-sm" /></Field>
          </div>
          <div className="grid gap-5 rounded-xl border border-border/70 bg-muted/15 p-4 sm:grid-cols-3">
            <Field label="출전" htmlFor="player-appearances"><Input id="player-appearances" name="appearances" type="number" min={0} max={9999} defaultValue={player.appearances} required className="h-11 rounded-xl px-3.5 text-sm" /></Field>
            <Field label="득점" htmlFor="player-goals"><Input id="player-goals" name="goals" type="number" min={0} max={9999} defaultValue={player.goals} required className="h-11 rounded-xl px-3.5 text-sm" /></Field>
            <Field label="도움" htmlFor="player-assists"><Input id="player-assists" name="assists" type="number" min={0} max={9999} defaultValue={player.assists} required className="h-11 rounded-xl px-3.5 text-sm" /></Field>
          </div>
          <Field label="수정 이유" htmlFor="override-reason"><Textarea id="override-reason" name="reason" defaultValue={defaultReason} minLength={3} maxLength={1000} required className="min-h-28 rounded-xl px-3.5 py-3 text-sm" placeholder="내용을 입력하세요." /></Field>
          {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}
          <DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline" className="h-11 px-5 text-base font-bold">취소</Button></DialogClose><Button type="submit" disabled={pending} className="h-11 px-6 text-base font-bold">{pending ? "수정 중" : "선수 정보 수정"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: ReactNode }) {
  return <div className={`space-y-2.5 ${className ?? ""}`}><label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">{label}</label>{children}</div>;
}

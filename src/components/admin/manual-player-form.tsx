"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createManualPlayerAction, initialAdminActionState } from "@/lib/admin/actions";

export function ManualPlayerForm({ teams }: { teams: Array<{ id: string; name: string }> }) {
  const [state, action] = useActionState(createManualPlayerAction, initialAdminActionState);
  return <form action={action} className="grid gap-4 sm:grid-cols-2">
    <label className="block text-xs font-medium">소속 팀<select name="teamId" required className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"><option value="">팀 선택</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label className="block text-xs font-medium">원문 선수명<Input name="playerName" required maxLength={120} className="mt-1.5 text-xs" /></label>
    <label className="block text-xs font-medium">검증 한글명<Input name="displayNameKo" maxLength={120} className="mt-1.5 text-xs" /></label>
    <label className="block text-xs font-medium">등번호<Input name="shirtNumber" type="number" min={0} max={999} className="mt-1.5 text-xs" /></label>
    <label className="block text-xs font-medium">포지션<Input name="position" maxLength={80} className="mt-1.5 text-xs" placeholder="예: Midfielder" /></label>
    <label className="block text-xs font-medium">세부 포지션<Input name="detailedPosition" maxLength={80} className="mt-1.5 text-xs" /></label>
    <label className="block text-xs font-medium sm:col-span-2">등록 사유<Textarea name="reason" required minLength={3} maxLength={1000} rows={3} className="mt-1.5 text-xs" placeholder="수동 등록 근거와 확인 내용을 입력하세요." /></label>
    <div className="sm:col-span-2">{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}<div className="mt-3 flex justify-end"><ActionSubmit>수동 선수 등록</ActionSubmit></div></div>
  </form>;
}

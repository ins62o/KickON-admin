"use client";
import { useActionState } from "react";
import { mergeManualPlayerAction, initialAdminActionState } from "@/lib/admin/actions";
import type { PlayerRecord } from "@/lib/data/types";
import { ActionSubmit } from "./action-submit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ManualPlayerMergeForm({ player, candidates }: { player: PlayerRecord; candidates: PlayerRecord[] }) {
  const [state, action] = useActionState(mergeManualPlayerAction, initialAdminActionState);
  return <form action={action} className="mt-4 space-y-4">
    <input type="hidden" name="manualPlayerId" value={player.id} /><input type="hidden" name="leagueId" value={player.leagueId} /><input type="hidden" name="season" value={player.season} />
    <Select name="providerPlayerId" required><SelectTrigger aria-label="병합할 공급자 선수" className="w-full"><SelectValue placeholder="동일 리그의 선수 선택" /></SelectTrigger><SelectContent>{candidates.filter((item) => item.leagueId === player.leagueId && item.season === player.season && !item.id.startsWith("manual_")).map((item) => <SelectItem key={item.id} value={item.id}>{item.koreanName ?? item.name} · {item.teamName} · {item.id}</SelectItem>)}</SelectContent></Select>
    <Textarea name="reason" aria-label="병합 사유" minLength={3} maxLength={1000} required placeholder="병합 사유" />
    <label className="flex gap-2 text-sm"><input type="checkbox" required />선택한 선수와 동일 인물임을 확인했습니다. 수동 선수는 병합 후 선수단에서 제외됩니다.</label>
    {state.message ? <p role="status" className="text-sm">{state.message}</p> : null}<ActionSubmit>선수 병합</ActionSubmit>
  </form>;
}

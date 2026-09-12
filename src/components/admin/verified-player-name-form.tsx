"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState, setVerifiedPlayerNameAction } from "@/lib/admin/actions";

export function VerifiedPlayerNameForm({ playerId, currentName, leagueId, season }: { playerId: string; leagueId: string; season: number; currentName: string | null }) {
  const [state, action] = useActionState(setVerifiedPlayerNameAction, initialAdminActionState);
  return <form action={action} className="space-y-4"><input type="hidden" name="playerId" value={playerId} /><input type="hidden" name="leagueId" value={leagueId} /><input type="hidden" name="season" value={season} /><label className="block text-xs font-medium">검증 한글명<Input name="nameKo" required maxLength={120} defaultValue={currentName ?? ""} className="mt-1.5 text-xs" /></label><label className="block text-xs font-medium">변경 사유<Textarea name="reason" required minLength={3} maxLength={1000} rows={3} className="mt-1.5 text-xs" /></label>{state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}<div className="flex justify-end"><ActionSubmit>검증명 저장</ActionSubmit></div></form>;
}

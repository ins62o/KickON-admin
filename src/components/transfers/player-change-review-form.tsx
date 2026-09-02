"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updatePlayerChangeAction, type OperationActionState } from "@/lib/operations/actions";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };

export function PlayerChangeReviewForm({ changeId, playerId, status, changeType, note, dbReflected, canEdit }: {
  changeId: string; playerId: string; status: string; changeType: string; note: string | null; dbReflected: boolean; canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updatePlayerChangeAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="changeId" value={changeId} />
      <input type="hidden" name="playerId" value={playerId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><label htmlFor="player-change-type" className="text-xs font-medium">이동/변경 유형</label><Select name="changeType" defaultValue={changeType} disabled={!canEdit}><SelectTrigger id="player-change-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="squad_added">선수단 추가</SelectItem><SelectItem value="transfer">완전 이적</SelectItem><SelectItem value="loan_in">임대 영입</SelectItem><SelectItem value="loan_out">임대 이적</SelectItem><SelectItem value="loan_return">임대 복귀</SelectItem><SelectItem value="released">방출</SelectItem><SelectItem value="contract_expired">계약 만료</SelectItem><SelectItem value="squad_removed">선수단 제외</SelectItem><SelectItem value="shirt_number_change">등번호 변경</SelectItem><SelectItem value="position_change">포지션 변경</SelectItem><SelectItem value="unknown">확인 필요</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label htmlFor="player-change-status" className="text-xs font-medium">처리 상태</label><Select name="status" defaultValue={status} disabled={!canEdit}><SelectTrigger id="player-change-status" aria-describedby={!dbReflected ? "player-change-status-help" : undefined} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="detected">확인 필요</SelectItem><SelectItem value="reviewing">검토 중</SelectItem><SelectItem value="applied" disabled={!dbReflected}>반영 완료</SelectItem><SelectItem value="ignored">무시</SelectItem></SelectContent></Select></div>
      </div>
      {!dbReflected ? <p id="player-change-status-help" className="rounded-md border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-5 text-amber-100/75">앱 데이터 반영이 확인되기 전에는 ‘반영 완료’를 선택할 수 없습니다.</p> : null}
      <div className="space-y-1.5"><label htmlFor="change-note" className="text-xs font-medium">검토 메모</label><Textarea id="change-note" name="note" defaultValue={note ?? ""} minLength={3} maxLength={2000} required disabled={!canEdit} placeholder="이적 공시·구단 발표·외부 데이터 확인 내용을 기록하세요." className="min-h-28" /></div>
      {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}
      <Button type="submit" disabled={!canEdit || pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "저장 중" : "검토 결과 저장"}</Button>
      {!canEdit ? <p className="text-[11px] text-muted-foreground">검토 결과를 저장하려면 운영자 권한으로 로그인해야 합니다.</p> : null}
    </form>
  );
}

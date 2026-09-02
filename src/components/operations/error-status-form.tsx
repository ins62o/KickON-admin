"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateErrorGroupAction, type OperationActionState } from "@/lib/operations/actions";
import type { ErrorGroupRecord } from "@/lib/data/errors";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };

export function ErrorStatusForm({ groupId, status, note, canEdit }: { groupId: string; status: ErrorGroupRecord["status"]; note: string | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState(updateErrorGroupAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      <div className="space-y-1.5"><label className="text-xs font-medium">처리 상태</label><Select name="status" defaultValue={status} disabled={!canEdit}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">미해결</SelectItem><SelectItem value="investigating">조사 중</SelectItem><SelectItem value="resolved">해결</SelectItem><SelectItem value="ignored">무시</SelectItem></SelectContent></Select></div>
      <div className="space-y-1.5"><label htmlFor="error-note" className="text-xs font-medium">처리 메모</label><Textarea id="error-note" name="note" defaultValue={note ?? ""} minLength={3} maxLength={2000} required disabled={!canEdit} placeholder="원인, 조치 내용 또는 무시 사유를 기록하세요." className="min-h-28" /></div>
      {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}
      <Button type="submit" disabled={!canEdit || pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "저장 중" : "상태 저장"}</Button>
      {!canEdit ? <p className="text-[11px] text-muted-foreground">실제 관리자 세션과 운영자 이상의 권한이 필요합니다.</p> : null}
    </form>
  );
}

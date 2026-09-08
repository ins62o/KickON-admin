"use client";

import { useActionState, useState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyUserModerationAction, initialAdminActionState } from "@/lib/admin/actions";

export function UserModerationForm({ userId, suspended, reportId }: { userId: string; suspended: boolean; reportId?: string }) {
  const [state, action] = useActionState(applyUserModerationAction, initialAdminActionState);
  const [selectedAction, setSelectedAction] = useState(suspended ? "UNSUSPEND" : "WARN");

  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
    <input type="hidden" name="userId" value={userId} />
    {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
    <label className="block text-xs font-medium">조치<select name="action" value={selectedAction} onChange={(event) => setSelectedAction(event.target.value)} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"><option value="WARN">경고 기록</option><option value="SUSPEND">커뮤니티 활동 정지</option>{suspended ? <option value="UNSUSPEND">정지 해제</option> : null}</select></label>
    <label className="block text-xs font-medium">정지 종료 시각<Input type="datetime-local" name="suspendedUntil" disabled={selectedAction !== "SUSPEND"} className="mt-1.5 text-xs" /><span className="mt-1 block text-[10px] font-normal text-muted-foreground">정지 조치를 선택한 경우에만 사용합니다. 최대 365일입니다.</span></label>
    <label className="block text-xs font-medium">조치 사유<Textarea name="reason" required minLength={3} maxLength={1000} rows={3} className="mt-1.5 text-xs" placeholder="사용자 조치 근거와 확인 내용을 입력하세요." /></label>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit variant={suspended ? "outline" : "default"}>사용자 조치 저장</ActionSubmit></div>
  </form>;
}

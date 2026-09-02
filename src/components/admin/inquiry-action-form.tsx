"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState, updateSupportInquiryAction } from "@/lib/admin/actions";

export function InquiryActionForm({ inquiryId, status, answer }: { inquiryId: string; status: string; answer: string | null }) {
  const [state, action] = useActionState(updateSupportInquiryAction, initialAdminActionState);
  const visibleStatus = ["ANSWERED", "CLOSED"].includes(status) ? "ANSWERED" : "RECEIVED";
  return <form action={action} className="space-y-4">
    <input type="hidden" name="inquiryId" value={inquiryId} />
    <label className="block text-xs font-medium">처리 상태<select name="status" defaultValue={visibleStatus} className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-xs"><option value="RECEIVED">새 문의</option><option value="ANSWERED">답변 완료</option></select></label>
    <label className="block text-xs font-medium">사용자 답변<Textarea name="answer" defaultValue={answer ?? ""} maxLength={4000} rows={7} className="mt-1.5 text-xs" placeholder="사용자에게 전달할 답변" /></label>
    <label className="block text-xs font-medium">내부 메모<Textarea name="note" maxLength={4000} rows={3} className="mt-1.5 text-xs" placeholder="사용자에게 보이지 않는 운영 메모" /></label>
    <label className="block text-xs font-medium">변경 사유<Textarea name="reason" required minLength={3} maxLength={1000} rows={2} className="mt-1.5 text-xs" placeholder="감사 로그에 남길 사유" /></label>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit>문의 저장</ActionSubmit></div>
  </form>;
}

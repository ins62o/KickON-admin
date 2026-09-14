"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState, updateSupportInquiryAction } from "@/lib/admin/actions";

export function InquiryActionForm({ inquiryId, answer }: { inquiryId: string; answer: string | null }) {
  const [state, action] = useActionState(updateSupportInquiryAction, initialAdminActionState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="inquiryId" value={inquiryId} />
    <Textarea aria-label="답변 내용" name="answer" required defaultValue={answer ?? ""} maxLength={4000} rows={7} className="min-h-48 rounded-xl px-3.5 py-3 text-sm sm:min-h-16 sm:rounded-lg sm:px-2.5 sm:py-2" placeholder="사용자에게 전달할 답변" />
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit className="h-11! w-full px-5 font-extrabold sm:w-auto">답변 저장</ActionSubmit></div>
  </form>;
}

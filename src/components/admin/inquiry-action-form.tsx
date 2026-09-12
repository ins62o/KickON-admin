"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState, updateSupportInquiryAction } from "@/lib/admin/actions";

export function InquiryActionForm({ inquiryId, answer }: { inquiryId: string; answer: string | null }) {
  const [state, action] = useActionState(updateSupportInquiryAction, initialAdminActionState);
  return <form action={action} className="space-y-4">
    <input type="hidden" name="inquiryId" value={inquiryId} />
    <label className="block text-sm font-medium">사용자 답변<Textarea name="answer" required defaultValue={answer ?? ""} maxLength={4000} rows={7} className="mt-2 text-sm" placeholder="사용자에게 전달할 답변" /></label>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit>답변 저장</ActionSubmit></div>
  </form>;
}

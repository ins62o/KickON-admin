"use client";

import { useActionState, useState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyUserModerationAction, initialAdminActionState } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

const suspensionDayOptions = [1, 3, 7, 30, 90, 365] as const;

type UserModerationFormProps = {
  userId: string;
  accountStatus: string | null;
  reportId?: string;
};

function initialAction(accountStatus: string | null) {
  if (accountStatus === "ACCOUNT_SUSPENDED") return "ACCOUNT_UNSUSPEND";
  if (["COMMUNITY_SUSPENDED", "SUSPENDED"].includes(accountStatus ?? "")) return "UNSUSPEND";
  return "WARN";
}

export function UserModerationForm({ userId, accountStatus, reportId }: UserModerationFormProps) {
  const [state, action] = useActionState(applyUserModerationAction, initialAdminActionState);
  const [selectedAction, setSelectedAction] = useState(initialAction(accountStatus));
  const [suspensionDays, setSuspensionDays] = useState("7");
  const suspensionEnabled = ["SUSPEND", "ACCOUNT_SUSPEND"].includes(selectedAction);
  const communitySuspended = ["COMMUNITY_SUSPENDED", "SUSPENDED"].includes(accountStatus ?? "");
  const accountSuspended = accountStatus === "ACCOUNT_SUSPENDED";
  const destructiveAction = selectedAction === "ACCOUNT_SUSPEND";

  return <form action={action} onReset={(event) => event.preventDefault()} className="w-full space-y-5">
    <input type="hidden" name="userId" value={userId} />
    <input type="hidden" name="suspensionDays" value={suspensionEnabled ? suspensionDays : ""} />
    {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-end">
      <div className="space-y-2">
        <label htmlFor="user-moderation-action" className="block text-sm font-medium">조치</label>
        <Select name="action" value={selectedAction} onValueChange={setSelectedAction}>
          <SelectTrigger id="user-moderation-action" className="h-11! w-full cursor-pointer rounded-lg border-border/80 bg-muted/35 px-3.5 text-sm font-medium hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-lg border border-border/80 bg-popover p-1 shadow-2xl">
            <SelectItem value="WARN" className="cursor-pointer py-2.5 pr-8 pl-2.5">경고 기록</SelectItem>
            <SelectItem value="SUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">커뮤니티 활동 정지</SelectItem>
            <SelectItem value="ACCOUNT_SUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5 text-danger focus:text-danger">계정 전체 정지</SelectItem>
            {communitySuspended ? <SelectItem value="UNSUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">커뮤니티 정지 해제</SelectItem> : null}
            {accountSuspended ? <SelectItem value="ACCOUNT_UNSUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">계정 정지 해제</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <fieldset className={cn("space-y-2", !suspensionEnabled && "opacity-55")}>
        <legend className="text-sm font-medium">정지 기간</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {suspensionDayOptions.map((days) => <button key={days} type="button" disabled={!suspensionEnabled} aria-pressed={suspensionDays === String(days)} onClick={() => setSuspensionDays(String(days))} className={cn("h-11 rounded-lg border border-border/80 bg-muted/30 px-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:border-border/80 disabled:hover:bg-muted/30", suspensionDays === String(days) && suspensionEnabled && "border-primary bg-primary/10 text-primary")}>{days}일</button>)}
        </div>
      </fieldset>
    </div>
    <div className="space-y-2">
      <label htmlFor="user-moderation-reason" className="block text-sm font-medium">조치 사유</label>
      <Textarea id="user-moderation-reason" name="reason" required minLength={3} maxLength={1000} rows={4} className="min-h-28 text-sm" placeholder="사용자 조치 근거와 확인 내용을 입력하세요." />
    </div>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit variant={destructiveAction ? "destructive" : accountSuspended || communitySuspended ? "outline" : "default"}>사용자 조치 저장</ActionSubmit></div>
  </form>;
}

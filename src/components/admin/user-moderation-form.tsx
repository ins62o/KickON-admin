"use client";

import { useActionState, useState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyUserModerationAction, initialAdminActionState } from "@/lib/admin/actions";
import { cn } from "@/lib/utils";

const suspensionDayOptions = [1, 3, 7, 30, 90, 365] as const;

type UserModerationFormProps = {
  userId: string;
  nickname: string;
  accountStatus: string | null;
  reportId?: string;
};

function initialAction(accountStatus: string | null) {
  if (accountStatus === "ACCOUNT_SUSPENDED") return "ACCOUNT_UNSUSPEND";
  if (["COMMUNITY_SUSPENDED", "SUSPENDED"].includes(accountStatus ?? "")) return "UNSUSPEND";
  return "SUSPEND";
}

export function UserModerationForm({ userId, nickname, accountStatus, reportId }: UserModerationFormProps) {
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
    <div className="grid gap-5 md:grid-cols-3">
      <div className="space-y-2">
        <label htmlFor="user-moderation-nickname" className="block text-sm font-medium">닉네임</label>
        <Select value={userId}>
          <SelectTrigger id="user-moderation-nickname" className="h-11! w-full cursor-pointer rounded-lg border-border/80 bg-muted/35 px-3.5 text-sm font-medium hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-lg border border-border/80 bg-popover p-1 shadow-2xl">
            <SelectItem value={userId} className="cursor-pointer py-2.5 pr-8 pl-2.5">{nickname}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label htmlFor="user-moderation-action" className="block text-sm font-medium">조치</label>
        <Select name="action" value={selectedAction} onValueChange={setSelectedAction}>
          <SelectTrigger id="user-moderation-action" className="h-11! w-full cursor-pointer rounded-lg border-border/80 bg-muted/35 px-3.5 text-sm font-medium hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-lg border border-border/80 bg-popover p-1 shadow-2xl">
            <SelectItem value="SUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">커뮤니티 활동 정지</SelectItem>
            <SelectItem value="ACCOUNT_SUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5 text-danger focus:text-danger">계정 전체 정지</SelectItem>
            {communitySuspended ? <SelectItem value="UNSUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">커뮤니티 정지 해제</SelectItem> : null}
            {accountSuspended ? <SelectItem value="ACCOUNT_UNSUSPEND" className="cursor-pointer py-2.5 pr-8 pl-2.5">계정 정지 해제</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>
      <div className={cn("space-y-2", !suspensionEnabled && "opacity-55")}>
        <label htmlFor="user-moderation-duration" className="block text-sm font-medium">정지 기간</label>
        <Select value={suspensionEnabled ? suspensionDays : ""} onValueChange={setSuspensionDays} disabled={!suspensionEnabled}>
          <SelectTrigger id="user-moderation-duration" className="h-11! w-full cursor-pointer rounded-lg border-border/80 bg-muted/35 px-3.5 text-sm font-medium hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 disabled:cursor-not-allowed dark:bg-muted/35 dark:hover:bg-muted/50">
            <SelectValue placeholder="해당 없음" />
          </SelectTrigger>
          <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-lg border border-border/80 bg-popover p-1 shadow-2xl">
            {suspensionDayOptions.map((days) => <SelectItem key={days} value={String(days)} className="cursor-pointer py-2.5 pr-8 pl-2.5">{days}일</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
    <div className="space-y-2">
      <label htmlFor="user-moderation-reason" className="block text-sm font-medium">조치 사유</label>
      <Textarea id="user-moderation-reason" name="reason" required minLength={3} maxLength={1000} rows={4} className="min-h-28 px-4 py-3.5 text-sm" placeholder="사용자 조치 근거와 확인 내용을 입력하세요." />
    </div>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null}
    <div className="flex justify-end"><ActionSubmit pendingLabel="실행 중…" className="min-w-28 px-6" variant={destructiveAction ? "destructive" : accountSuspended || communitySuspended ? "outline" : "default"}>실행</ActionSubmit></div>
  </form>;
}

export function UserModerationDialog({ userId, accountStatus, nickname }: UserModerationFormProps) {
  return <Dialog>
    <DialogTrigger asChild>
      <Button type="button" variant="destructive" size="default" className="min-w-24 px-5">
        정지
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] gap-6 overflow-y-auto rounded-2xl p-5 sm:max-w-3xl sm:p-6" aria-describedby={undefined}>
      <DialogHeader className="gap-0 pr-9">
        <DialogTitle className="text-xl leading-7">사용자 조치</DialogTitle>
      </DialogHeader>
      <UserModerationForm key={`${userId}:${accountStatus}`} userId={userId} nickname={nickname} accountStatus={accountStatus} />
    </DialogContent>
  </Dialog>;
}

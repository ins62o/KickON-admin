"use client";

import { useActionState } from "react";
import { ActionSubmit } from "@/components/admin/action-submit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initialAdminActionState, setContentVisibilityAction, updateContentReportAction } from "@/lib/admin/actions";

export function ReportStatusForm({ reportId, status }: { reportId: string; status: string }) {
  const [state, action] = useActionState(updateContentReportAction, initialAdminActionState);
  const visibleStatus = ["RESOLVED", "DISMISSED"].includes(status) ? "RESOLVED" : "OPEN";
  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4">
    <input type="hidden" name="reportId" value={reportId} />
    <div>
      <label htmlFor={`report-status-${reportId}`} className="block text-xs font-medium">신고 처리 상태</label>
      <Select key={visibleStatus} name="status" defaultValue={visibleStatus}>
        <SelectTrigger id={`report-status-${reportId}`} className="mt-1.5 h-11! w-full"><SelectValue /></SelectTrigger>
        <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
          <SelectItem value="OPEN"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />신규 신고</SelectItem>
          <SelectItem value="RESOLVED"><span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />처리 완료</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <label className="block text-xs font-medium">처리 메모 (선택)<Textarea name="resolutionNote" maxLength={2000} rows={3} className="mt-1.5 text-xs" placeholder="처리 완료 시 비우면 ‘관리자 콘솔에서 신고 처리 완료’로 기록됩니다" /></label>
    <label className="block text-xs font-medium">변경 사유 (선택)<Textarea name="reason" maxLength={1000} rows={2} className="mt-1.5 text-xs" placeholder="감사 로그에 남길 사유" /></label>
    <ActionMessage state={state} />
    <div className="flex justify-end"><ActionSubmit>처리 상태 저장</ActionSubmit></div>
  </form>;
}

export function ContentVisibilityForm({ reportId, targetType, targetId, hidden }: { reportId: string; targetType: string; targetId: string; hidden: boolean }) {
  const [state, action] = useActionState(setContentVisibilityAction, initialAdminActionState);
  return <form action={action} onReset={(event) => event.preventDefault()} className="space-y-4"><input type="hidden" name="reportId" value={reportId} /><input type="hidden" name="targetType" value={targetType} /><input type="hidden" name="targetId" value={targetId} /><input type="hidden" name="hidden" value={hidden ? "false" : "true"} /><p className="text-xs leading-5 text-muted-foreground">{hidden ? "원문 노출을 복원합니다." : "원문은 삭제하지 않고 모바일·웹의 일반 조회에서 숨깁니다."}</p><label className="block text-xs font-medium">{hidden ? "복원" : "숨김"} 사유 (선택)<Textarea name="reason" maxLength={1000} rows={3} className="mt-1.5 text-xs" /></label><ActionMessage state={state} /><div className="flex justify-end"><ActionSubmit variant={hidden ? "outline" : "destructive"}>{hidden ? "콘텐츠 복원" : "콘텐츠 숨김"}</ActionSubmit></div></form>;
}

function ActionMessage({ state }: { state: { status: string; message: string | null } }) { return state.message ? <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "text-xs text-danger" : "text-xs text-success"}>{state.message}</p> : null; }

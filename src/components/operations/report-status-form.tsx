"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateReportAction, type OperationActionState } from "@/lib/operations/actions";
import type { ReportPriority, ReportStatus } from "@/lib/data/reports";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };

export function ReportStatusForm({ reportId, status, priority, note, canEdit }: {
  reportId: string;
  status: ReportStatus;
  priority: ReportPriority;
  note: string | null;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateReportAction, initialState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><label className="text-xs font-medium">처리 상태</label><Select name="status" defaultValue={status} disabled={!canEdit}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">신규</SelectItem><SelectItem value="in_review">확인 중</SelectItem><SelectItem value="on_hold">보류</SelectItem><SelectItem value="resolved">수정 완료</SelectItem><SelectItem value="rejected">정상 데이터</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><label className="text-xs font-medium">우선순위</label><Select name="priority" defaultValue={priority} disabled={!canEdit}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">낮음</SelectItem><SelectItem value="normal">보통</SelectItem><SelectItem value="high">높음</SelectItem><SelectItem value="urgent">긴급</SelectItem></SelectContent></Select></div>
      </div>
      <div className="space-y-1.5"><label htmlFor="report-note" className="text-xs font-medium">처리 메모</label><Textarea id="report-note" name="note" defaultValue={note ?? ""} minLength={3} maxLength={2000} required disabled={!canEdit} placeholder="확인 내용과 변경 이유를 기록하세요." className="min-h-28" /></div>
      {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}
      <Button type="submit" disabled={!canEdit || pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "저장 중" : "상태 저장"}</Button>
      {!canEdit ? <p className="text-[11px] text-muted-foreground">실제 관리자 세션과 운영자 이상의 권한이 필요합니다.</p> : null}
    </form>
  );
}

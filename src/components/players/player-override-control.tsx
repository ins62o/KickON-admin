"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, LockKeyhole, LockOpen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyPlayerOverrideAction, releasePlayerOverrideAction, type OperationActionState } from "@/lib/operations/actions";
import type { ManualOverrideRecord } from "@/lib/data/player-operations";

const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };
const fieldLabels: Record<string, string> = { display_name_ko: "한글명", shirt_number: "등번호", position: "포지션", detailed_position: "세부 포지션", in_squad: "선수단 포함" };

export function PlayerOverrideControl({ playerId, overrides, canEdit, openApply = false, defaultReason = "" }: { playerId: string; overrides: ManualOverrideRecord[]; canEdit: boolean; openApply?: boolean; defaultReason?: string }) {
  const active = overrides.filter((item) => !item.releasedAt);
  return (
    <div className="space-y-4">
      <ApplyOverrideDialog playerId={playerId} canEdit={canEdit} open={openApply && canEdit} defaultReason={defaultReason} />
      <div className="space-y-2">
        {active.length > 0 ? active.map((item) => <ActiveOverride key={item.id} playerId={playerId} item={item} canEdit={canEdit} />) : <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">보호 중인 직접 수정값이 없습니다.</p>}
      </div>
      {!canEdit ? <p className="text-[11px] leading-5 text-muted-foreground">직접 수정은 관리자 권한이 필요합니다.</p> : null}
    </div>
  );
}

function ApplyOverrideDialog({ playerId, canEdit, open, defaultReason }: { playerId: string; canEdit: boolean; open: boolean; defaultReason: string }) {
  const [field, setField] = useState("display_name_ko");
  const [state, action, pending] = useActionState(applyPlayerOverrideAction, initialState);
  return (
    <Dialog defaultOpen={open}>
      <DialogTrigger asChild><Button className="w-full" disabled={!canEdit}><LockKeyhole className="size-4" /> 정보 직접 수정</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>선수 정보 직접 수정</DialogTitle><DialogDescription>직접 수정한 항목은 보호를 해제하기 전까지 외부 데이터 새로고침으로 바뀌지 않습니다.</DialogDescription></DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="playerId" value={playerId} />
          <div className="space-y-1.5"><label htmlFor="player-override-field" className="text-xs font-medium">수정할 항목</label><Select name="field" value={field} onValueChange={setField}><SelectTrigger id="player-override-field" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="display_name_ko">한글명</SelectItem><SelectItem value="shirt_number">등번호</SelectItem><SelectItem value="position">포지션</SelectItem><SelectItem value="detailed_position">세부 포지션</SelectItem><SelectItem value="in_squad">선수단 포함 여부</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><label htmlFor="override-value" className="text-xs font-medium">수정값</label>{field === "in_squad" ? <Select name="value" defaultValue="true"><SelectTrigger id="override-value" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">포함</SelectItem><SelectItem value="false">제외</SelectItem></SelectContent></Select> : <Input id="override-value" name="value" type={field === "shirt_number" ? "number" : "text"} min={field === "shirt_number" ? 0 : undefined} max={field === "shirt_number" ? 999 : undefined} maxLength={160} required placeholder={field === "shirt_number" ? "예: 9" : "수정할 값"} />}</div>
          <div className="space-y-1.5"><label htmlFor="override-reason" className="text-xs font-medium">수정 이유</label><Textarea id="override-reason" name="reason" defaultValue={defaultReason} minLength={3} maxLength={1000} required placeholder="공식 구단 발표 또는 사용자 제보 등 근거를 기록하세요." /></div>
          {state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}
          <DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}{pending ? "저장 중" : "수정값 저장"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActiveOverride({ playerId, item, canEdit }: { playerId: string; item: ManualOverrideRecord; canEdit: boolean }) {
  const [state, action, pending] = useActionState(releasePlayerOverrideAction, initialState);
  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{fieldLabels[item.fieldPath] ?? item.fieldPath}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={display(item.overrideValue)}>{display(item.originalValue)} → {display(item.overrideValue)}</p></div><span className="inline-flex items-center gap-1 text-[10px] text-primary"><LockKeyhole className="size-3" /> 자동 변경 방지</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.reason}</p>
      <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm" className="mt-2 w-full" disabled={!canEdit}><LockOpen className="size-3.5" /> 수정값 보호 해제</Button></DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{fieldLabels[item.fieldPath] ?? item.fieldPath} 수정값 보호 해제</DialogTitle><DialogDescription>현재 값은 바로 바뀌지 않습니다. 다음 선수단 새로고침부터 외부 최신값을 다시 따릅니다.</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input type="hidden" name="overrideId" value={item.id} /><input type="hidden" name="playerId" value={playerId} /><div className="space-y-1.5"><label htmlFor={`release-${item.id}`} className="text-xs font-medium">해제 이유</label><Textarea id={`release-${item.id}`} name="reason" minLength={3} maxLength={1000} required placeholder="외부 데이터가 수정된 것을 확인함" /></div>{state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}<DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" variant="destructive" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <LockOpen className="size-4" />}{pending ? "해제 중" : "보호 해제"}</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}

function display(value: unknown) { return value === null || value === undefined ? "없음" : typeof value === "string" ? value : JSON.stringify(value); }

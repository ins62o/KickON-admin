"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, LockKeyhole, LockOpen, Save } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { applyFixtureOverrideAction, applyStandingOverrideAction, releaseEntityOverrideAction, type OperationActionState } from "@/lib/operations/actions";
import type { EntityOverrideRecord } from "@/lib/data/provider-diffs";

type EntityType = "fixture" | "standing";
type FieldOption = { value: string; label: string; kind: "number" | "datetime" | "status"; step?: string };

const fixtureFields: FieldOption[] = [
  { value: "kickoff_at", label: "경기 시각", kind: "datetime" }, { value: "status", label: "경기 상태", kind: "status" },
  { value: "home_score", label: "홈 점수", kind: "number" }, { value: "away_score", label: "원정 점수", kind: "number" },
  { value: "round", label: "라운드", kind: "number" },
];
const standingFields: FieldOption[] = [
  { value: "rank", label: "순위", kind: "number" }, { value: "played", label: "경기", kind: "number" },
  { value: "won", label: "승", kind: "number" }, { value: "drawn", label: "무", kind: "number" }, { value: "lost", label: "패", kind: "number" },
  { value: "goals_for", label: "득점", kind: "number" }, { value: "goals_against", label: "실점", kind: "number" },
  { value: "goal_difference", label: "득실차", kind: "number" }, { value: "points", label: "승점", kind: "number" },
  { value: "clean_sheets", label: "클린시트", kind: "number" }, { value: "average_possession", label: "평균 점유율", kind: "number", step: "0.1" },
];
const initialState: OperationActionState = { status: "idle", message: null, completedAt: null };

export function EntityOverrideControl({ entityType, entityId, overrides, currentValues, canEdit, openApply = false, defaultReason = "", triggerLabel = "직접 수정", dialogTitle, dialogDescription, submitLabel = "수정값 저장", triggerClassName = "w-full", showTriggerIcon = true, showSubmitIcon = true, showApplyTrigger = true, showActiveOverrides = true, showEmptyOverrides = true }: {
  entityType: EntityType; entityId: string; overrides: EntityOverrideRecord[]; currentValues: Record<string, unknown>; canEdit: boolean; openApply?: boolean; defaultReason?: string; triggerLabel?: string; dialogTitle?: string; dialogDescription?: string | false; submitLabel?: string; triggerClassName?: string; showTriggerIcon?: boolean; showSubmitIcon?: boolean; showApplyTrigger?: boolean; showActiveOverrides?: boolean; showEmptyOverrides?: boolean;
}) {
  const active = overrides.filter((item) => !item.releasedAt);
  return <div className={showActiveOverrides ? "space-y-4" : undefined}>{showApplyTrigger ? <ApplyDialog entityType={entityType} entityId={entityId} currentValues={currentValues} canEdit={canEdit} open={openApply && canEdit} defaultReason={defaultReason} triggerLabel={triggerLabel} dialogTitle={dialogTitle} dialogDescription={dialogDescription} submitLabel={submitLabel} triggerClassName={triggerClassName} showTriggerIcon={showTriggerIcon} showSubmitIcon={showSubmitIcon} /> : null}{showActiveOverrides ? <>{active.length > 0 || showEmptyOverrides ? <div className="space-y-2">{active.length > 0 ? active.map((item) => <ActiveOverride key={item.id} item={item} canEdit={canEdit} />) : <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">보호 중인 직접 수정값이 없습니다.</p>}</div> : null}{!canEdit && active.length > 0 ? <p className="text-[11px] leading-5 text-muted-foreground">직접 수정은 관리자 권한이 필요합니다.</p> : null}</> : null}</div>;
}

function ApplyDialog({ entityType, entityId, currentValues, canEdit, open, defaultReason, triggerLabel, dialogTitle, dialogDescription, submitLabel, triggerClassName, showTriggerIcon, showSubmitIcon }: { entityType: EntityType; entityId: string; currentValues: Record<string, unknown>; canEdit: boolean; open: boolean; defaultReason: string; triggerLabel: string; dialogTitle?: string; dialogDescription?: string | false; submitLabel: string; triggerClassName: string; showTriggerIcon: boolean; showSubmitIcon: boolean }) {
  const fields = entityType === "fixture" ? fixtureFields : standingFields;
  const [field, setField] = useState(fields[0].value);
  const selected = fields.find((item) => item.value === field) ?? fields[0];
  const serverAction = entityType === "fixture" ? applyFixtureOverrideAction : applyStandingOverrideAction;
  const [state, action, pending] = useActionState(serverAction, initialState);
  const description = dialogDescription === undefined
    ? "직접 수정한 값은 보호를 해제하기 전까지 외부 데이터 새로고침으로 바뀌지 않습니다."
    : dialogDescription;
  return <Dialog defaultOpen={open}><DialogTrigger asChild><Button className={triggerClassName} disabled={!canEdit}>{showTriggerIcon ? <LockKeyhole className="size-4" /> : null}{triggerLabel}</Button></DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader className="pb-1"><DialogTitle className="text-xl">{dialogTitle ?? `${entityType === "fixture" ? "경기" : "순위"} 정보 직접 수정`}</DialogTitle>{description ? <DialogDescription>{description}</DialogDescription> : null}</DialogHeader><form action={action} className="mt-2 space-y-6"><input type="hidden" name="entityId" value={entityId} /><div className="space-y-2.5"><label htmlFor={`${entityType}-override-field`} className="block text-sm font-semibold text-foreground">수정할 항목</label><Select name="field" value={field} onValueChange={setField}><SelectTrigger id={`${entityType}-override-field`} className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl">{fields.map((item) => <SelectItem key={item.value} value={item.value} className="cursor-pointer py-2.5 pr-8 pl-2.5">{item.label}</SelectItem>)}</SelectContent></Select></div><ValueInput option={selected} value={currentValues[field]} /><div className="space-y-2.5"><label htmlFor={`${entityType}-override-reason`} className="block text-sm font-semibold text-foreground">수정 이유</label><Textarea id={`${entityType}-override-reason`} name="reason" defaultValue={defaultReason} minLength={3} maxLength={1000} required className="min-h-28 rounded-xl px-3.5 py-3 text-sm" placeholder="내용을 입력하세요." /></div>{state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}<DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline" className="h-11 px-5 text-base">취소</Button></DialogClose><Button type="submit" disabled={pending} className="h-11 px-6 text-base">{pending ? <LoaderCircle className="size-4 animate-spin" /> : showSubmitIcon ? <Save className="size-4" /> : null}{pending ? "저장 중" : submitLabel}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ValueInput({ option, value }: { option: FieldOption; value: unknown }) {
  if (option.kind === "status") return <div className="space-y-2.5"><label htmlFor="override-value-status" className="block text-sm font-semibold text-foreground">수정값</label><Select name="value" defaultValue={typeof value === "string" ? value : "SCHEDULED"}><SelectTrigger id="override-value-status" className="h-11! w-full cursor-pointer rounded-xl border-border/80 bg-muted/35 px-3.5 text-sm font-medium shadow-inner shadow-black/5 hover:bg-muted/50 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-primary/15 dark:bg-muted/35 dark:hover:bg-muted/50"><SelectValue /></SelectTrigger><SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width) rounded-xl border border-border/80 bg-popover p-1 shadow-2xl"><SelectItem value="SCHEDULED" className="cursor-pointer py-2.5 pr-8 pl-2.5">예정</SelectItem><SelectItem value="LIVE" className="cursor-pointer py-2.5 pr-8 pl-2.5">진행 중</SelectItem><SelectItem value="FINISHED" className="cursor-pointer py-2.5 pr-8 pl-2.5">종료</SelectItem><SelectItem value="CANCELED" className="cursor-pointer py-2.5 pr-8 pl-2.5">취소</SelectItem></SelectContent></Select></div>;
  const inputValue = option.kind === "datetime" && typeof value === "string" ? koreaDateTimeInput(value) : value === null || value === undefined ? "" : String(value);
  return <div className="space-y-2.5"><label htmlFor={`override-value-${option.value}`} className="block text-sm font-semibold text-foreground">수정값</label><Input key={option.value} id={`override-value-${option.value}`} name="value" type={option.kind === "datetime" ? "datetime-local" : "number"} defaultValue={inputValue} step={option.step} required className="h-11 rounded-xl px-3.5 text-sm" /></div>;
}

function ActiveOverride({ item, canEdit }: { item: EntityOverrideRecord; canEdit: boolean }) {
  const [state, action, pending] = useActionState(releaseEntityOverrideAction, initialState);
  const fields = item.entityType === "fixture" ? fixtureFields : standingFields;
  const fixtureScheduleLabels: Record<string, string> = { stadium_id: "경기장", attendance_latitude: "직관 인증 위도", attendance_longitude: "직관 인증 경도", attendance_radius_meters: "직관 인증 반경" };
  const label = fields.find((field) => field.value === item.fieldPath)?.label ?? fixtureScheduleLabels[item.fieldPath] ?? item.fieldPath;
  return <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium">{label}</p><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{show(item.originalValue)} → {show(item.overrideValue)}</p></div><span className="inline-flex items-center gap-1 text-[10px] text-primary"><LockKeyhole className="size-3" /> 자동 변경 방지</span></div><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{item.reason}</p><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="mt-2 w-full" disabled={!canEdit}><LockOpen className="size-3.5" /> 수정값 보호 해제</Button></AlertDialogTrigger><AlertDialogContent><form action={action} className="space-y-4"><input type="hidden" name="overrideId" value={item.id} /><input type="hidden" name="entityId" value={item.entityId} /><input type="hidden" name="entityType" value={item.entityType} /><AlertDialogHeader><AlertDialogTitle>{label} 수정값 보호 해제</AlertDialogTitle><AlertDialogDescription>현재 값은 바로 바뀌지 않습니다. 다음 데이터 새로고침부터 외부 최신값을 다시 따릅니다.</AlertDialogDescription></AlertDialogHeader><div className="space-y-1.5"><label htmlFor={`release-${item.id}`} className="text-xs font-medium">해제 이유</label><Textarea id={`release-${item.id}`} name="reason" minLength={3} maxLength={1000} required placeholder="외부 데이터가 수정된 것을 확인함" /></div>{state.message ? <p role="status" className={state.status === "success" ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{state.message}</p> : null}<AlertDialogFooter><AlertDialogCancel type="button">취소</AlertDialogCancel><AlertDialogAction asChild><Button type="submit" variant="destructive" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <LockOpen className="size-4" />}{pending ? "해제 중" : "보호 해제"}</Button></AlertDialogAction></AlertDialogFooter></form></AlertDialogContent></AlertDialog></div>;
}

function koreaDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
function show(value: unknown) { return value === null || value === undefined ? "없음" : typeof value === "string" ? value : JSON.stringify(value); }

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { LoaderCircle, Play, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { runCronMaintenanceAction, type CronMaintenanceActionState } from "@/lib/cron/actions";
import type { CronMaintenanceJobKey } from "@/lib/cron/catalog";
import { cn } from "@/lib/utils";

const initialState: CronMaintenanceActionState = { status: "idle", message: null, jobKey: null, runId: null };

export function CronMaintenanceControl({ jobKey, label, target, environment, canRun }: { jobKey: CronMaintenanceJobKey; label: string; target: string; environment: "development" | "production"; canRun: boolean }) {
  const [state, action, pending] = useActionState(runCronMaintenanceAction, initialState);
  if (!canRun) return <span className="text-[10px] text-muted-foreground">관리자 권한 필요</span>;
  return <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm"><Play className="size-3.5" /> 실행 준비</Button></DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{label} 실행</DialogTitle><DialogDescription>{environment === "production" ? "운영" : "개발"} 환경에서 {target}를 영구 삭제합니다.</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input type="hidden" name="jobKey" value={jobKey} /><div className="space-y-1.5"><label htmlFor={`cron-reason-${jobKey}`} className="text-xs font-medium">실행 이유</label><Textarea id={`cron-reason-${jobKey}`} name="reason" minLength={3} maxLength={500} required placeholder="예: 보관 기간이 지난 기록 정리" /></div><div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.055] px-3 py-2.5 text-xs leading-5 text-rose-100/75"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-300" /> 삭제된 데이터는 데이터 센터에서 복구할 수 없습니다. 대상과 환경을 다시 확인하세요.</div>{state.message && state.jobKey === jobKey ? <div role="status" className={cn("rounded-lg border px-3 py-2.5 text-xs leading-5", state.status === "success" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200" : "border-rose-400/20 bg-rose-400/[0.06] text-rose-200")}><p>{state.message}</p>{state.runId ? <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/sync-history/${state.runId}`}>실행 기록 보기</Link></Button> : null}</div> : null}<DialogFooter className="mx-0 mb-0 rounded-lg px-0 pb-0"><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" variant="destructive" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}{pending ? "정리 중" : "확인 후 삭제"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

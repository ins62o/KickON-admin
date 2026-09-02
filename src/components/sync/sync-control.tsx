"use client";

import { useActionState } from "react";
import {
  Activity,
  ArchiveRestore,
  CalendarCheck2,
  ClipboardList,
  Clock3,
  DatabaseBackup,
  RefreshCcw,
  ShieldAlert,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { runSyncAction, type SyncActionState } from "@/lib/sync/actions";
import {
  syncOperations,
  type SyncOperation,
  type SyncOperationLastSyncMap,
} from "@/lib/sync/catalog";
import { formatKoreaDateTime, formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type SyncControlProps = {
  teams: Array<{ id: string; name: string }>;
  fixtures: Array<{ id: string; label: string }>;
  canRun: boolean;
  secretReady: boolean;
  environment: "development" | "production";
  initialOperation?: SyncOperation;
  initialTeamId?: string;
  initialFixtureId?: string;
  providerRemaining: number | null;
  providerAllowance: number | null;
  providerResetAt: string | null;
  providerQuotaLow: boolean;
  lastSync: SyncOperationLastSyncMap;
};

const iconByOperation: Record<SyncOperation, typeof RefreshCcw> = {
  "team-squad": UsersRound,
  "fixture-lineup": ClipboardList,
  "team-metrics": Trophy,
  live: Activity,
  full: DatabaseBackup,
  "post-match": CalendarCheck2,
  "history-backfill": ArchiveRestore,
};

const initialState: SyncActionState = { status: "idle", message: null, operation: null, completedAt: null };

const syncSelectTriggerClassName = "h-11 w-full rounded-xl border-border/90 bg-background/45 px-3.5 text-sm shadow-inner shadow-black/10 transition-colors hover:border-primary/35 hover:bg-background/65 data-[state=open]:border-primary/50 data-[state=open]:ring-3 data-[state=open]:ring-ring/20";
const syncSelectContentClassName = "max-h-72 rounded-xl border border-border/90 bg-popover p-1.5 shadow-2xl shadow-black/25";
const syncSelectItemClassName = "my-1 min-h-11 cursor-pointer rounded-lg py-2.5 pr-10 pl-3 text-sm transition-colors first:mt-0 last:mb-0 focus:bg-primary/10 focus:text-foreground data-[state=checked]:bg-primary/12 data-[state=checked]:font-semibold data-[state=checked]:text-primary dark:focus:bg-primary/15 dark:data-[state=checked]:bg-primary/15";

export function SyncControl(props: SyncControlProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[1260px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/70"
        role="group"
        aria-label="데이터 동기화 작업"
      >
        {syncOperations.map((operation) => (
          <SyncOperationButton key={operation.key} operation={operation} {...props} />
        ))}
      </div>
    </div>
  );
}

function SyncOperationButton({ operation, teams, fixtures, canRun, secretReady, environment, initialOperation, initialTeamId, initialFixtureId, providerRemaining, providerAllowance, providerResetAt, providerQuotaLow, lastSync }: SyncControlProps & { operation: (typeof syncOperations)[number] }) {
  const [state, action, pending] = useActionState(runSyncAction, initialState);
  const Icon = iconByOperation[operation.key];
  const targetUnavailable = operation.target === "team"
    ? teams.length === 0
    : operation.target === "fixture"
      ? fixtures.length === 0
      : false;
  const isHighCost = operation.requiresSecret;
  const disabledReason = targetUnavailable
    ? "실행할 대상을 확인할 수 없습니다."
    : operation.requiresSecret && !secretReady
      ? "서버 연결 설정이 필요합니다."
      : null;
  const disabled = !canRun || disabledReason !== null;
  const operationLastSync = lastSync[operation.key];

  return (
    <Dialog defaultOpen={initialOperation === operation.key}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="h-36 w-full min-w-0 cursor-pointer flex-col items-stretch justify-start gap-0 rounded-none bg-card px-4 py-4 text-left whitespace-normal hover:bg-primary/[0.06]"
          aria-label={`${operation.label} 실행`}
          title={`${operation.label} 데이터 갱신${disabledReason ? ` · ${disabledReason}` : ""}`}
        >
          <span className="flex w-full items-start">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary"
            >
              <Icon className="size-4.5" aria-hidden="true" />
            </span>
          </span>
          <span className="mt-3 block max-w-full truncate text-sm font-semibold text-foreground">{operation.label}</span>
          <span
            className="mt-auto flex w-full items-center gap-1.5 border-t border-border/60 pt-3 text-xs font-normal text-muted-foreground"
            title={operationLastSync.at ? `마지막 동기화 ${formatKoreaDateTime(operationLastSync.at)}` : `마지막 동기화 ${operationLastSync.label}`}
          >
            <Clock3 className="size-3.5" aria-hidden="true" />
            <span className="truncate">마지막 동기화 · {operationLastSync.label}</span>
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-6 rounded-2xl p-5 sm:max-w-lg sm:p-6" aria-describedby={undefined}>
        <DialogHeader className="gap-0 pr-9">
          <div className="flex items-center gap-3">
            <DialogTitle className="min-w-0 flex-1 text-lg leading-7">{operation.label} 데이터 갱신</DialogTitle>
            {isHighCost ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-700/25 bg-amber-600/[0.08] px-2 py-1 text-[11px] font-medium text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                <ShieldAlert className="size-3.5" aria-hidden="true" />
                고사용량
              </span>
            ) : null}
          </div>
        </DialogHeader>
        <form action={action} className="space-y-6">
          <input type="hidden" name="operation" value={operation.key} />

          {disabledReason ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-700 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {disabledReason}
            </div>
          ) : null}

          {operation.target === "team" ? (
            <div className="grid gap-4">
              <label htmlFor={`sync-team-${operation.key}`} className="block text-sm leading-none font-medium">대상 구단</label>
              <Select name="teamId" defaultValue={teams.some((team) => team.id === initialTeamId) ? initialTeamId : undefined} required>
                <SelectTrigger id={`sync-team-${operation.key}`} className={syncSelectTriggerClassName}><SelectValue placeholder="구단 선택" /></SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={6} className={syncSelectContentClassName}>
                  {teams.map((team) => <SelectItem key={team.id} value={team.id} className={syncSelectItemClassName}>{team.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {operation.target === "fixture" ? (
            <div className="grid gap-4">
              <label htmlFor={`sync-fixture-${operation.key}`} className="block text-sm leading-none font-medium">대상 경기</label>
              <Select name="fixtureId" defaultValue={fixtures.some((fixture) => fixture.id === initialFixtureId) ? initialFixtureId : undefined} required>
                <SelectTrigger id={`sync-fixture-${operation.key}`} className={syncSelectTriggerClassName}><SelectValue placeholder="경기 선택" /></SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={6} className={syncSelectContentClassName}>
                  {fixtures.map((fixture) => <SelectItem key={fixture.id} value={fixture.id} className={syncSelectItemClassName}>{fixture.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4">
            <label htmlFor={`reason-${operation.key}`} className="block text-sm leading-none font-medium">실행 이유</label>
            <Textarea className="min-h-24" id={`reason-${operation.key}`} name="reason" minLength={3} maxLength={500} required placeholder="예: 사용자 제보 확인을 위해 선수단 다시 가져오기" />
          </div>

          {providerQuotaLow ? (
            <div className="rounded-lg border border-amber-700/25 bg-amber-600/[0.08] p-3 text-xs leading-5 text-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <p>현재 잔여량은 {formatNumber(providerRemaining)}회{providerAllowance === null ? "" : ` / ${formatNumber(providerAllowance)}회`}입니다.{providerResetAt ? ` ${formatRelativeTime(providerResetAt)} 초기화 예정입니다.` : ""}</p>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-amber-700/20 bg-background/45 px-3 py-2 text-foreground">
                <input type="checkbox" name="confirmLowQuota" value="yes" required className="mt-0.5 size-4 accent-primary" />
                <span>잔여 할당량이 낮은 상태에서 이 작업을 실행하는 것을 확인했습니다.</span>
              </label>
            </div>
          ) : null}

          {state.message && state.operation === operation.key ? (
            <div role="status" className={cn("rounded-lg border px-3 py-2.5 text-xs leading-5", state.status === "success" ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200" : state.status === "warning" ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-100" : "border-rose-400/20 bg-rose-400/[0.06] text-rose-200")}>
              {state.message}
            </div>
          ) : null}

          <DialogFooter className="mx-0 -mb-1 mt-1 rounded-lg bg-muted/35 px-0 pt-5 pb-0">
            <DialogClose asChild><Button type="button" variant="outline" size="lg" className="min-w-16">취소</Button></DialogClose>
            <Button type="submit" size="lg" className="min-w-16" variant={providerQuotaLow || (environment === "production" && isHighCost) ? "destructive" : "default"} disabled={pending || disabled}>
              {pending ? "실행 중" : "실행"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

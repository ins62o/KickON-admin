"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleOff,
  CircleX,
  Clock,
  LoaderCircle,
  RefreshCcw,
  TimerReset,
  type LucideIcon,
} from "lucide-react";

import { AdminStatusBadge, type AdminStatusTone } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizeCronJobs, type CronJobState } from "@/lib/cron/jobs";
import { useClientData } from "@/lib/client-data";
import { getCronData, type CronData, type CronJobRecord } from "@/lib/data/platform-operations";
import { formatKoreaReadableDateTime, formatRelativeTime } from "@/lib/format";

const STATE_META: Record<CronJobState, { label: string; tone: AdminStatusTone; icon: LucideIcon }> = {
  normal: { label: "정상", tone: "success", icon: CircleCheck },
  failed: { label: "실패", tone: "danger", icon: CircleX },
  delayed: { label: "지연", tone: "warning", icon: Clock },
  missing: { label: "등록 안 됨", tone: "warning", icon: CircleAlert },
  running: { label: "실행 중", tone: "info", icon: LoaderCircle },
  waiting: { label: "기록 없음", tone: "neutral", icon: CircleDashed },
  inactive: { label: "꺼짐", tone: "neutral", icon: CircleOff },
  unknown: { label: "확인 불가", tone: "neutral", icon: CircleHelp },
};

const STATE_HINT: Partial<Record<CronJobState, string>> = {
  delayed: "예정된 실행이 시작되지 않았습니다.",
  missing: "마이그레이션에는 있지만 이 환경의 pg_cron에 등록되어 있지 않습니다.",
  waiting: "등록은 되어 있지만 아직 실행 기록이 없습니다.",
  inactive: "pg_cron에서 비활성화된 작업입니다.",
};

function formatUntil(value: string | null) {
  if (!value) return "-";
  const minutes = Math.max(0, Math.round((Date.parse(value) - Date.now()) / 60_000));
  if (minutes < 1) return "곧";
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}시간 후` : `${Math.round(hours / 24)}일 후`;
}

function StateBadge({ job }: { job: CronJobRecord }) {
  const meta = STATE_META[job.state];
  return (
    <AdminStatusBadge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      title={STATE_HINT[job.state]}
      className={job.state === "running" ? "[&_svg]:animate-spin" : undefined}
    />
  );
}

function FailureMessage({ job }: { job: CronJobRecord }) {
  if (job.state !== "failed" || !job.lastMessage) return null;
  return (
    <p className="mt-1.5 line-clamp-2 break-all text-[11px] leading-4 text-danger" title={job.lastMessage}>
      {job.lastMessage}
    </p>
  );
}

function LastRun({ job }: { job: CronJobRecord }) {
  if (!job.lastStartedAt) return <span className="text-muted-foreground">-</span>;
  return <span title={formatKoreaReadableDateTime(job.lastStartedAt)}>{formatRelativeTime(job.lastStartedAt)}</span>;
}

function NextRun({ job }: { job: CronJobRecord }) {
  if (!job.nextRunAt) return <span className="text-muted-foreground">-</span>;
  return <span title={formatKoreaReadableDateTime(job.nextRunAt)}>{formatUntil(job.nextRunAt)}</span>;
}

export function CronJobStatusSection() {
  const { data, error, loading, reload } = useClientData(getCronData);
  return <CronJobStatusView data={data} error={error} loading={loading} reload={reload} />;
}

export function CronJobStatusView({ data, error, loading, reload }: {
  data: CronData | null;
  error: string | null;
  loading: boolean;
  reload: () => void | Promise<void>;
}) {
  const summary = data ? summarizeCronJobs(data.jobs) : null;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-border/80 bg-card/35" aria-labelledby="cron-jobs-title">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <TimerReset className="size-4" aria-hidden="true" />
          </span>
          <h2 id="cron-jobs-title" className="whitespace-nowrap text-base font-semibold">자동 실행 작업</h2>
          {summary && data?.runtimeConnected ? (
            <AdminStatusBadge
              label={summary.problems > 0
                ? `${summary.total}개 중 ${summary.problems}개 확인 필요`
                : summary.normal === summary.total
                  ? `${summary.total}개 모두 정상`
                  : `${summary.normal}개 정상${summary.inactive ? ` · ${summary.inactive}개 꺼짐` : ""}`}
              tone={summary.failed > 0 ? "danger" : summary.problems > 0 ? "warning" : "success"}
            />
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => void reload()} aria-label="자동 실행 작업 새로고침">
          <RefreshCcw className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">새로고침</span>
        </Button>
      </header>

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-10 w-full" />)}
        </div>
      ) : error || !data ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{error ?? "자동 실행 작업을 불러오지 못했습니다."}</p>
      ) : (
        <>
          {data.error ? (
            <p className="flex items-start gap-2 border-b border-warning/20 bg-warning/5 px-4 py-3 text-xs text-warning">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {data.error}
            </p>
          ) : null}

          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th scope="col" className="w-28 px-4 py-2.5 font-medium">상태</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">작업</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">실행 주기</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">마지막 실행</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">다음 실행</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.key} className="border-b border-border/50 align-top last:border-0">
                    <td className="px-4 py-3"><StateBadge job={job} /></td>
                    <td className="px-4 py-3">
                      <p className="font-medium" title={job.key}>{job.name}</p>
                      <FailureMessage job={job} />
                    </td>
                    <td className="px-4 py-3 text-xs" title={`${job.expression} (UTC)`}>{job.scheduleLabel}</td>
                    <td className="px-4 py-3 text-xs"><LastRun job={job} /></td>
                    <td className="px-4 py-3 text-xs"><NextRun job={job} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/60 md:hidden">
            {data.jobs.map((job) => (
              <li key={job.key} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" title={job.key}>{job.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{job.scheduleLabel}</p>
                  </div>
                  <StateBadge job={job} />
                </div>
                <FailureMessage job={job} />
                <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div><dt className="text-muted-foreground">마지막</dt><dd className="mt-0.5"><LastRun job={job} /></dd></div>
                  <div><dt className="text-muted-foreground">다음</dt><dd className="mt-0.5"><NextRun job={job} /></dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

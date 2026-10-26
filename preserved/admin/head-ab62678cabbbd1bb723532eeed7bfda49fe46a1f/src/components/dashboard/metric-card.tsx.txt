import { Activity, AlertTriangle, Building2, CalendarDays, Clock3, Database, RefreshCcw, ShieldAlert, UsersRound, Wifi } from "lucide-react";
import type { Metric } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

const metricIcons: Record<string, typeof Activity> = {
  "등록 구단 수": Building2,
  "등록 선수 수": UsersRound,
  "가입자 수": UsersRound,
  "오늘 경기 수": CalendarDays,
  "진행 중 경기": Wifi,
  "마지막 데이터 동기화": Clock3,
  "동기화 실패": RefreshCcw,
  "최근 24시간 앱 오류": ShieldAlert,
  "미처리 사용자 제보": AlertTriangle,
  "SportsMonks 잔여량": Activity,
  "Supabase DB 사용량": Database,
};

const metricLabels: Record<string, string> = {
  "마지막 데이터 동기화": "마지막 데이터 새로고침",
  "동기화 실패": "새로고침 실패",
  "SportsMonks 잔여량": "외부 데이터 잔여 호출",
  "Supabase DB 사용량": "데이터 저장 공간",
};

export function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metricIcons[metric.label] ?? Activity;
  const availabilityLabel = metric.availability === "error" ? "조회 실패" : metric.availability === "unavailable" ? "연동 필요" : undefined;
  return (
    <article className={cn(
      "group min-w-0 border-r border-b border-border/70 bg-card/35 p-4 transition-colors hover:bg-card/65",
      metric.status === "danger" && "bg-rose-500/[0.035]",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-8 items-center justify-center rounded-md border border-border/75 bg-background/50 text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <StatusBadge status={metric.status} label={availabilityLabel} />
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">{metricLabels[metric.label] ?? metric.label}</p>
      <p className={cn("tabular mt-1 truncate text-2xl font-semibold tracking-tight", metric.availability !== "available" && "text-muted-foreground")}>
        {metric.value}
      </p>
      <p className="mt-2 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground/70">{metric.detail}</p>
    </article>
  );
}

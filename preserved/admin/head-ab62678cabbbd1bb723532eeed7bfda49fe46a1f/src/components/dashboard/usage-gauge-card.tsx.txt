import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import type { HealthStatus } from "@/lib/data/types";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type GaugeDetail = {
  label: string;
  value: string;
};

export type UsageGaugePanelProps = {
  title: string;
  rate: number | null;
  status: HealthStatus;
  centerValue: string;
  centerLabel: string;
  details: GaugeDetail[];
  updatedAt: string | null;
  message: string;
};

export type UsageGaugeCardProps = UsageGaugePanelProps & {
  eyebrow: string;
  description: string;
  icon: LucideIcon;
};

function gaugeColor(status: HealthStatus) {
  if (status === "danger") return "var(--gauge-danger)";
  if (status === "warning") return "var(--gauge-warning)";
  return "var(--gauge-normal)";
}

export function UsageStatusBadge({ status }: { status: HealthStatus }) {
  const label = status === "danger"
    ? "한도 임박"
    : status === "warning"
      ? "주의"
      : status === "normal"
        ? "정상"
        : "확인 필요";
  const StatusIcon = status === "danger" || status === "warning"
    ? AlertTriangle
    : status === "normal"
      ? CheckCircle2
      : Clock3;

  return (
    <span className={cn(
      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
      status === "normal" && "border-primary/25 bg-primary/10 text-primary",
      status === "warning" && "border-warning/25 bg-warning/10 text-warning",
      status === "danger" && "border-danger/25 bg-danger/10 text-danger",
      status === "unknown" && "border-border bg-muted text-muted-foreground",
    )}>
      <StatusIcon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function UsageGaugeHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  status,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: HealthStatus;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-border px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">{eyebrow}</p>
            <h2 className="mt-1 text-lg font-bold tracking-[-0.02em]">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <UsageStatusBadge status={status} />
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </header>
  );
}

export function UsageGaugePanel({
  title,
  rate,
  status,
  centerValue,
  centerLabel,
  details,
  updatedAt,
  message,
}: UsageGaugePanelProps) {
  const color = gaugeColor(status);
  const filledDegrees = rate === null ? 0 : Math.round((rate / 100) * 270);
  const startCapColor = rate !== null && rate > 0
    ? color
    : "var(--gauge-track)";
  const endCapColor = rate !== null && rate >= 100
    ? color
    : "var(--gauge-track)";

  return (
    <>
      <div className="flex-1 px-5 py-7 sm:px-8 sm:py-9">
        <div
          className="relative mx-auto size-56 rounded-full sm:size-64"
          style={{
            background: `conic-gradient(from 225deg, ${color} 0deg ${filledDegrees}deg, var(--gauge-track) ${filledDegrees}deg 270deg, transparent 270deg 360deg)`,
          }}
          role="img"
          aria-label={rate === null ? `${title} 사용률을 계산할 수 없음` : `${title} 사용률 ${rate.toFixed(1)}퍼센트`}
        >
          <span
            className="pointer-events-none absolute top-[82.2%] left-[17.8%] size-5 -translate-x-1/2 -translate-y-1/2 rounded-full sm:size-6"
            style={{ backgroundColor: startCapColor }}
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute top-[82.2%] right-[17.8%] size-5 translate-x-1/2 -translate-y-1/2 rounded-full sm:size-6"
            style={{ backgroundColor: endCapColor }}
            aria-hidden="true"
          />
          <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card sm:inset-6">
            <p className="tabular max-w-[170px] truncate text-3xl font-bold tracking-[-0.05em] sm:text-4xl">{centerValue}</p>
            <p className="mt-2 text-sm font-medium text-muted-foreground">{centerLabel}</p>
            <p className="tabular mt-3 text-base font-semibold" style={{ color }}>
              {rate === null ? "사용률 계산 필요" : `${rate.toFixed(1)}% 사용`}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background/55 px-3 py-3 text-left sm:block sm:text-center"
            >
              <dt className="text-xs font-medium text-muted-foreground">{detail.label}</dt>
              <dd className="tabular truncate text-sm font-semibold sm:mt-1.5 sm:text-base">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <footer className="border-t border-border px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">{message}</p>
          <p className="shrink-0 text-xs text-muted-foreground">
            {updatedAt ? `${formatRelativeTime(updatedAt)} 확인` : "확인 기록 없음"}
          </p>
        </div>
      </footer>
    </>
  );
}

export function UsageGaugeCard({
  eyebrow,
  title,
  description,
  icon,
  ...panelProps
}: UsageGaugeCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <UsageGaugeHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        icon={icon}
        status={panelProps.status}
      />
      <UsageGaugePanel title={title} {...panelProps} />
    </article>
  );
}

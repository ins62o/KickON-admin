import type { ReactNode } from "react";
import {
  AlertTriangle,
  DatabaseZap,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type DataStateKind = "loading" | "empty" | "error" | "unavailable";

export type DataStateProps = {
  kind: DataStateKind;
  title?: ReactNode;
  description?: ReactNode;
  hideDescription?: boolean;
  action?: ReactNode;
  actionLabel?: string;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
};

const stateConfig: Record<DataStateKind, {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
}> = {
  loading: {
    title: "데이터를 불러오는 중입니다",
    description: "잠시만 기다려 주세요.",
    icon: DatabaseZap,
    iconClassName: "border-primary/20 bg-primary/10 text-primary",
  },
  empty: {
    title: "표시할 데이터가 없습니다",
    description: "조건을 바꾸거나 데이터가 수집된 뒤 다시 확인해 주세요.",
    icon: Inbox,
    iconClassName: "border-border bg-muted/60 text-muted-foreground",
  },
  error: {
    title: "데이터를 불러오지 못했습니다",
    description: "연결 상태를 확인한 뒤 다시 시도해 주세요.",
    icon: AlertTriangle,
    iconClassName: "border-destructive/25 bg-destructive/10 text-destructive",
  },
  unavailable: {
    title: "데이터 연결이 필요합니다",
    description: "필요한 설정이나 수집 기록이 준비된 뒤 표시됩니다.",
    icon: DatabaseZap,
    iconClassName:
      "border-amber-700/20 bg-amber-600/[0.08] text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  },
};

export function DataState({
  kind,
  title,
  description,
  hideDescription = false,
  action,
  actionLabel = "데이터 상태 작업",
  icon,
  compact = false,
  className,
}: DataStateProps) {
  const config = stateConfig[kind];
  const Icon = icon ?? config.icon;
  const isLoading = kind === "loading";
  const role = kind === "error" ? "alert" : isLoading ? "status" : undefined;

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col justify-center px-5",
          compact ? "min-h-28 py-5" : "min-h-48 py-8",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-busy="true"
        data-state="loading"
      >
        <span className="sr-only">{title ?? stateConfig.loading.title}</span>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-40 max-w-full" />
            {!hideDescription ? <Skeleton className="mt-2 h-3 w-64 max-w-full" /> : null}
          </div>
        </div>
        {!compact ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-5 text-center",
        compact ? "min-h-28 py-5" : "min-h-48 py-8",
        className,
      )}
      role={role}
      aria-live={role ? "polite" : undefined}
      aria-atomic={role ? "true" : undefined}
      aria-busy={isLoading || undefined}
      data-state={kind}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border",
          config.iconClassName,
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title ?? config.title}</p>
      {!hideDescription ? (
        <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
          {description ?? config.description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2" role="group" aria-label={actionLabel}>
          {action}
        </div>
      ) : null}
    </div>
  );
}

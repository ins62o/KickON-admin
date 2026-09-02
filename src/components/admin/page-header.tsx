import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  context?: ReactNode;
  status?: ReactNode;
  metadata?: ReactNode;
  actions?: ReactNode;
  actionsLabel?: string;
  headingLevel?: 1 | 2;
  headingId?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  context,
  status,
  metadata,
  actions,
  actionsLabel = "페이지 작업",
  headingLevel = 1,
  headingId,
  className,
}: PageHeaderProps) {
  const generatedId = useId();
  const titleId = headingId ?? `admin-page-title-${generatedId}`;
  const descriptionId = description ? `${titleId}-description` : undefined;
  const Heading = headingLevel === 2 ? "h2" : "h1";

  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="min-w-0">
        {context ? (
          <div className="mb-1.5 text-xs font-medium text-primary">{context}</div>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Heading
            id={titleId}
            className="min-w-0 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            {title}
          </Heading>
          {status}
        </div>

        {description ? (
          <p id={descriptionId} className="mt-1.5 max-w-3xl text-base leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}

        {metadata ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {metadata}
          </div>
        ) : null}
      </div>

      {actions ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          role="group"
          aria-label={actionsLabel}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

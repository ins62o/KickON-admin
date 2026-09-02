import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  status?: ReactNode;
  actions?: ReactNode;
  actionsLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3;
  headingId?: string;
  padding?: "none" | "compact" | "default";
  className?: string;
  contentClassName?: string;
};

const paddingClass = {
  none: "",
  compact: "p-3 sm:p-4",
  default: "p-4 sm:p-5",
} as const;

export function SectionPanel({
  title,
  description,
  icon: Icon,
  status,
  actions,
  actionsLabel = "섹션 작업",
  children,
  footer,
  headingLevel = 2,
  headingId,
  padding = "none",
  className,
  contentClassName,
}: SectionPanelProps) {
  const generatedId = useId();
  const titleId = headingId ?? `admin-section-title-${generatedId}`;
  const descriptionId = description ? `${titleId}-description` : undefined;
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <section
      className={cn("min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card/40", className)}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="flex min-w-0 flex-col gap-3 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <span
              className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Heading id={titleId} className="text-sm font-semibold text-foreground">
                {title}
              </Heading>
              {status}
            </div>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div
            className="flex shrink-0 flex-wrap items-center gap-2"
            role="group"
            aria-label={actionsLabel}
          >
            {actions}
          </div>
        ) : null}
      </header>

      <div className={cn(paddingClass[padding], contentClassName)}>{children}</div>

      {footer ? (
        <footer className="border-t border-border/70 bg-muted/20 px-4 py-3 text-[11px] leading-4 text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

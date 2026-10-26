"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ActionSubmit({ children, variant = "default", className, pendingLabel = "저장 중…" }: { children: React.ReactNode; variant?: "default" | "destructive" | "outline"; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} className={className} disabled={pending} aria-disabled={pending}>{pending ? pendingLabel : children}</Button>;
}

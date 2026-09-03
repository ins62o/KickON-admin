"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function ActionSubmit({ children, variant = "default", className }: { children: React.ReactNode; variant?: "default" | "destructive" | "outline"; className?: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} size="sm" className={className} disabled={pending} aria-disabled={pending}>{pending ? "저장 중…" : children}</Button>;
}

import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <AppShell admin={admin}>{children}</AppShell>
  );
}

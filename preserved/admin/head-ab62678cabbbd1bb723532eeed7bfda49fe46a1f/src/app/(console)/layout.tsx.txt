import { AppShell } from "@/components/layout/app-shell";
import { AdminAuthProvider } from "@/components/auth/admin-auth-provider";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AppShell>{children}</AppShell>
    </AdminAuthProvider>
  );
}

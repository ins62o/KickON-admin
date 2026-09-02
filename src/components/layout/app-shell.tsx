import { Header } from "./header";
import type { AdminIdentity } from "@/lib/auth/server";

export function AppShell({ children, admin }: {
  children: React.ReactNode;
  admin: AdminIdentity;
}) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0">
        본문으로 바로가기
      </a>
      <div className="min-w-0">
        <Header admin={admin} />
        <main id="main-content" tabIndex={-1} className="min-w-0 outline-none">{children}</main>
      </div>
    </div>
  );
}

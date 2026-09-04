"use client";

import { Suspense } from "react";
import { Header } from "./header";
import { SiteFooter } from "./site-footer";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { ClientPageLoading } from "@/components/admin/client-page-state";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { admin, loading, switching } = useAdminAuth();
  const content = loading || !admin
    ? <ClientPageLoading label={loading ? "관리자 세션을 확인하고 있습니다." : "로그인 화면으로 이동하고 있습니다."} />
    : <Suspense fallback={<ClientPageLoading label="관리자 화면을 준비하고 있습니다." />}>{children}</Suspense>;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus:translate-y-0">
        본문으로 바로가기
      </a>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header admin={admin} loading={loading} switching={switching} />
        {switching ? (
          <div className="pointer-events-none fixed inset-x-0 top-[68px] z-30 h-0.5 bg-primary/80" role="status">
            <span className="sr-only">선택한 서버로 전환하고 있습니다.</span>
          </div>
        ) : null}
        <main id="main-content" tabIndex={-1} aria-busy={loading || switching} className="min-w-0 flex-1 outline-none">
          {content}
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}

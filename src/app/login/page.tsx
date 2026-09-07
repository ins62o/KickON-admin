"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { SiteFooter } from "@/components/layout/site-footer";
import LoginLoading from "./loading";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const params = useSearchParams();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <main className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-[410px]">
          <section className="rounded-xl border border-border bg-card p-7 shadow-2xl shadow-black/20 sm:p-8">
            <div className="flex items-center gap-3.5">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#08111e] shadow-sm">
                <Image src="/branding/app-logo.png" alt="KICKON" width={36} height={36} priority className="size-9 object-contain" />
              </div>
              <h1 className="text-lg font-semibold tracking-tight">킥온 데이터 센터</h1>
            </div>

            <LoginForm nextPath={params.get("next") ?? undefined} />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

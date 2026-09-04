"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Server } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { environmentLabel, setActiveConsoleEnvironment, useConsoleEnvironment, type ConsoleEnvironment } from "@/lib/environment";
import { cn } from "@/lib/utils";
import LoginLoading from "./loading";

const environmentOptions = ["development", "production"] as const satisfies readonly ConsoleEnvironment[];

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const params = useSearchParams();
  const environment = useConsoleEnvironment();

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

            <div className="mt-7 rounded-lg border border-border/80 bg-muted/30 p-1.5">
              <div className="mb-1.5 flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <Server className="size-3.5" aria-hidden="true" />
                <span>{environmentLabel(environment)} 관리자 계정으로 로그인합니다.</span>
              </div>
              <div className="grid grid-cols-2 gap-1" role="group" aria-label="로그인할 서버 선택">
                {environmentOptions.map((option) => {
                  const selected = option === environment;
                  return (
                    <Button
                      key={option}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveConsoleEnvironment(option)}
                      aria-pressed={selected}
                      className={cn(
                        "justify-center gap-1.5 text-xs",
                        selected && "bg-background text-foreground shadow-sm hover:bg-background",
                      )}
                    >
                      {environmentLabel(option)}
                      {selected ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </Button>
                  );
                })}
              </div>
            </div>

            <LoginForm key={environment} nextPath={params.get("next") ?? undefined} />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

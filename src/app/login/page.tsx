import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "관리자 로그인" };

type LoginPageProps = {
  searchParams: Promise<{ next?: string; reason?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-[410px]">
        <section className="rounded-xl border border-border bg-card p-7 shadow-2xl shadow-black/20 sm:p-8">
          <div className="flex items-center gap-3.5">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#08111e] shadow-sm">
              <Image src="/branding/app-logo.png" alt="KickOn" width={36} height={36} priority className="size-9 object-contain" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">킥온 데이터 센터</h1>
          </div>

          <LoginForm nextPath={params.next} />
        </section>
      </div>
    </main>
  );
}

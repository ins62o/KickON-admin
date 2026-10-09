"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { membershipDiagnosticRows, runMembershipDiagnostic, type MembershipDiagnostic } from "@/lib/admin/membership-diagnostic";
import { environmentLabel, type ConsoleEnvironment } from "@/lib/environment";

export function MembershipDiagnosticPanel({ environment }: { environment: ConsoleEnvironment }) {
  const [result, setResult] = useState<MembershipDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const check = async () => {
    if (running.current) return;
    running.current = true;
    setLoading(true); setResult(null); setError(null);
    try {
      const response = await runMembershipDiagnostic(environment);
      if (!mounted.current) return;
      if (response.ok) setResult(response.result);
      else setError(response.message);
    } finally {
      running.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <section aria-labelledby="membership-diagnostic-title" className="mt-6 max-w-3xl overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <h2 id="membership-diagnostic-title" className="font-semibold">Membership 인증 진단</h2>
        <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium">{environmentLabel(environment)}</span>
      </div>
      <div className="p-5">
        <p className="mb-4 text-sm text-muted-foreground">현재 로그인된 최고 관리자의 인증과 읽기 전용 진단 상태를 확인합니다.</p>
        <Button type="button" disabled={loading} onClick={() => void check()} aria-busy={loading}>
          {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {loading ? "확인 중…" : "인증 상태 확인"}
        </Button>
        {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
        <dl className="mt-5 divide-y divide-border/70" aria-live="polite" aria-busy={loading}>
          {membershipDiagnosticRows(result).map(row => (
            <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className={`break-all font-medium ${row.value === "FAIL" ? "text-destructive" : "text-foreground"}`}>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">Schema Compatible은 진단 함수가 확인하는 제한된 구조 범위의 결과입니다. 전체 데이터 정합성과 트랜잭션 시작 시점의 격리를 인증하는 결과는 아닙니다.</p>
      </div>
    </section>
  );
}

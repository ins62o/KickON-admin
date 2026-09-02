"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConsoleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-400/10 text-rose-300"><AlertTriangle className="size-5" /></div>
        <h1 className="mt-4 text-lg font-semibold">운영 데이터를 불러오지 못했습니다</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">연결 상태를 확인한 뒤 다시 시도하세요. 민감한 오류 상세는 화면에 노출하지 않습니다.</p>
        <Button className="mt-5" onClick={reset}><RotateCcw className="size-4" /> 다시 시도</Button>
      </div>
    </div>
  );
}

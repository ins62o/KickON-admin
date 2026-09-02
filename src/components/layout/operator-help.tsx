"use client";

import { BookOpenCheck, CircleHelp, Database, RefreshCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const terms = [
  { term: "데이터 새로고침", meaning: "외부 축구 데이터를 다시 가져와 킥온 데이터에 반영하는 작업입니다." },
  { term: "반영 필요", meaning: "외부에서는 바뀐 내용이 보이지만 킥온 앱 데이터에는 아직 적용되지 않은 상태입니다." },
  { term: "수동 보호", meaning: "운영자가 직접 고친 값을 다음 자동 갱신에서도 유지하는 기능입니다." },
  { term: "확인 불가", meaning: "장애로 단정할 수 없고, 연결 설정이나 수집 기록이 더 필요한 상태입니다." },
];

export function OperatorHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="운영 도움말" title="운영 도움말">
          <CircleHelp className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-5 pr-12">
          <div className="flex items-center gap-2 text-primary"><BookOpenCheck className="size-4" /><span className="text-xs font-semibold">운영 안내</span></div>
          <DialogTitle className="text-lg">처음 사용하는 운영자를 위한 빠른 안내</DialogTitle>
          <DialogDescription className="leading-6">개발 지식 없이도 대시보드의 안내 순서대로 확인하면 됩니다.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 p-5 md:grid-cols-[1.05fr_0.95fr]">
          <section>
            <h2 className="text-sm font-semibold">문제가 보일 때 처리 순서</h2>
            <ol className="mt-3 space-y-2">
              <HelpStep icon={ShieldAlert} title="대시보드에서 우선순위 확인" description="위험 항목부터 열고 어떤 구단, 경기, 선수 문제인지 확인합니다." />
              <HelpStep icon={Database} title="현재 값과 외부 값 비교" description="상세 화면의 데이터 비교에서 실제로 다른 항목만 확인합니다." />
              <HelpStep icon={RefreshCcw} title="필요한 대상만 새로고침" description="구단이나 경기 단위로 다시 가져온 뒤 결과 기록을 확인합니다." />
              <HelpStep icon={BookOpenCheck} title="처리 결과 남기기" description="제보와 변동 상태를 완료로 바꾸고 이유를 기록합니다." />
            </ol>
          </section>

          <section>
            <h2 className="text-sm font-semibold">화면 용어</h2>
            <dl className="mt-3 space-y-3 rounded-xl border border-border bg-background/45 p-4">
              {terms.map((item) => <div key={item.term}><dt className="text-xs font-semibold text-foreground">{item.term}</dt><dd className="mt-1 text-xs leading-5 text-muted-foreground">{item.meaning}</dd></div>)}
            </dl>
          </section>
        </div>

        <div className="border-t border-border bg-muted/35 px-5 py-4 text-xs leading-5 text-muted-foreground">
          <strong className="font-semibold text-foreground">안전 원칙:</strong> ‘확인 불가’는 정상이라는 뜻이 아닙니다. 수동 수정이나 데이터 새로고침 전에는 대상과 이유를 한 번 더 확인하세요.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpStep({ icon: Icon, title, description }: { icon: typeof ShieldAlert; title: string; description: string }) {
  return <li className="flex gap-3 rounded-xl border border-border bg-background/35 p-3"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div><div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div></li>;
}

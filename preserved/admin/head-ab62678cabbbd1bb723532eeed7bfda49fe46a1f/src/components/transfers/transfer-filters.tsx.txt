"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { TeamSelectOptions } from "@/components/admin/team-select-options";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FilterValues = { range: string; team: string; status: string; type: string };

export function TransferFilters({ values, teams }: { values: FilterValues; teams: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const change = (key: keyof FilterValues, value: string) => {
    const next = { ...values, [key]: value };
    const params = new URLSearchParams();
    Object.entries(next).forEach(([name, item]) => { if (item && item !== "all" && !(name === "range" && item === "30d")) params.set(name, item); });
    startTransition(() => router.push(`/transfers${params.size ? `?${params}` : ""}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="선수 변동 필터">
      <Select value={values.range} onValueChange={(value) => change("range", value)} disabled={pending}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="24h">최근 24시간</SelectItem><SelectItem value="7d">최근 7일</SelectItem><SelectItem value="30d">최근 30일</SelectItem></SelectContent></Select>
      <Select value={values.team} onValueChange={(value) => change("team", value)} disabled={pending}><SelectTrigger className="w-44"><SelectValue placeholder="전체 구단" /></SelectTrigger><SelectContent><SelectItem value="all">전체 구단</SelectItem><TeamSelectOptions teams={teams} /></SelectContent></Select>
      <Select value={values.status} onValueChange={(value) => change("status", value)} disabled={pending}><SelectTrigger className="w-32"><SelectValue placeholder="전체 상태" /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="detected">확인 필요</SelectItem><SelectItem value="reviewing">검토 중</SelectItem><SelectItem value="applied">반영 완료</SelectItem><SelectItem value="ignored">무시</SelectItem></SelectContent></Select>
      <Select value={values.type} onValueChange={(value) => change("type", value)} disabled={pending}><SelectTrigger className="w-40"><SelectValue placeholder="전체 유형" /></SelectTrigger><SelectContent><SelectItem value="all">전체 유형</SelectItem><SelectItem value="squad_added">선수단 추가</SelectItem><SelectItem value="transfer">완전 이적</SelectItem><SelectItem value="loan_in">임대 영입</SelectItem><SelectItem value="loan_out">임대 이적</SelectItem><SelectItem value="loan_return">임대 복귀</SelectItem><SelectItem value="released">방출</SelectItem><SelectItem value="contract_expired">계약 만료</SelectItem><SelectItem value="squad_removed">선수단 제외</SelectItem><SelectItem value="shirt_number_change">등번호 변경</SelectItem><SelectItem value="position_change">포지션 변경</SelectItem><SelectItem value="unknown">확인 필요</SelectItem></SelectContent></Select>
      {pending ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><LoaderCircle className="size-3 animate-spin" /> 갱신 중</span> : null}
    </div>
  );
}

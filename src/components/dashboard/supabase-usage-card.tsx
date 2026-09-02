"use client";

import { useState } from "react";
import { Database, HardDrive } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UsageGaugePanelProps } from "@/components/dashboard/usage-gauge-card";
import {
  UsageGaugeHeader,
  UsageGaugePanel,
} from "@/components/dashboard/usage-gauge-card";

type SupabaseUsageKind = "database" | "storage";

export type SupabaseUsageSnapshot = UsageGaugePanelProps & {
  description: string;
  limitLabel: string;
};

export function SupabaseUsageCard({
  database,
  storage,
}: {
  database: SupabaseUsageSnapshot;
  storage: SupabaseUsageSnapshot;
}) {
  const [selectedKind, setSelectedKind] = useState<SupabaseUsageKind>("database");
  const selected = selectedKind === "database" ? database : storage;
  const SelectedIcon = selectedKind === "database" ? Database : HardDrive;

  function selectKind(value: string) {
    if (value === "database" || value === "storage") setSelectedKind(value);
  }

  return (
    <Tabs value={selectedKind} onValueChange={selectKind} className="h-full gap-0">
      <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
        <UsageGaugeHeader
          eyebrow="Supabase"
          title={selected.title}
          description={selected.description}
          icon={SelectedIcon}
          status={selected.status}
        >
          <TabsList
            aria-label="Supabase 저장 공간 종류"
            className="grid h-10 w-full grid-cols-2 p-1"
          >
            <TabsTrigger value="database" className="gap-1 px-1 text-xs sm:gap-2 sm:px-3 sm:text-sm">
              <Database className="size-3.5" aria-hidden="true" />
              <span>데이터베이스</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{database.limitLabel}</span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="gap-1 px-1 text-xs sm:gap-2 sm:px-3 sm:text-sm">
              <HardDrive className="size-3.5" aria-hidden="true" />
              <span>파일 스토리지</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{storage.limitLabel}</span>
            </TabsTrigger>
          </TabsList>
        </UsageGaugeHeader>

        <TabsContent value="database" className="mt-0 flex flex-col">
          <UsageGaugePanel {...database} />
        </TabsContent>
        <TabsContent value="storage" className="mt-0 flex flex-col">
          <UsageGaugePanel {...storage} />
        </TabsContent>
      </article>
    </Tabs>
  );
}

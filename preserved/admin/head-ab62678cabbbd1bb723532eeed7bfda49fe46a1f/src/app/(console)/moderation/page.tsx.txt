"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientPageLoading } from "@/components/admin/client-page-state";

export default function ModerationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const nextQuery = new URLSearchParams({ tab: "reports" });
    for (const key of ["q", "status", "target"]) {
      const value = searchParams.get(key);
      if (value) nextQuery.set(key, value);
    }
    router.replace(`/inquiries?${nextQuery.toString()}`);
  }, [router, searchParams]);

  return <ClientPageLoading label="신고 내역으로 이동하고 있습니다." />;
}

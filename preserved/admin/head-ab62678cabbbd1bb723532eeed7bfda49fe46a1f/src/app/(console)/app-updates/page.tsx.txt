"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClientPageLoading } from "@/components/admin/client-page-state";

export default function AppUpdatesPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/data-management/?appUpdates=1"); }, [router]);
  return <ClientPageLoading label="앱 업데이트 설정으로 이동하고 있습니다." />;
}

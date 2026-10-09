"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { PageHeader } from "@/components/admin/page-header";
import { MembershipDiagnosticPanel } from "@/components/admin/membership-diagnostic-panel";
import { useRequiredAdminPermission } from "@/lib/auth/client";
import { canAccessMembershipDiagnostic } from "@/lib/auth/permissions";
import { useConsoleEnvironment } from "@/lib/environment";

export default function MembershipDiagnosticPage() {
  const permitted = useRequiredAdminPermission("admins.manage");
  const { admin, loading, switching } = useAdminAuth();
  const environment = useConsoleEnvironment();
  const router = useRouter();
  const allowed = Boolean(permitted && canAccessMembershipDiagnostic(admin, loading, switching));
  useEffect(() => {
    if (!loading && !switching && admin && !allowed) router.replace("/?reason=forbidden");
  }, [admin, allowed, loading, switching, router]);
  if (!allowed) return <p role="status" className="p-6 text-sm text-muted-foreground">관리자 접근 권한을 확인하고 있습니다.</p>;
  return <div className="mx-auto w-full max-w-[1720px] px-4 py-6 lg:px-6 lg:py-7">
    <PageHeader title="Membership 인증 진단" context="데이터 관리" />
    <MembershipDiagnosticPanel key={`${environment}:${admin!.userId}`} environment={environment} />
  </div>;
}

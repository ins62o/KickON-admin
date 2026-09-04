"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuth } from "@/components/auth/admin-auth-provider";
import { hasAdminPermission, type AdminPermission } from "@/lib/auth/permissions";

export function useRequiredAdminPermission(permission: AdminPermission) {
  const { admin } = useAdminAuth();
  const router = useRouter();
  const allowed = Boolean(admin && hasAdminPermission(admin.role, permission));

  useEffect(() => {
    if (admin && !allowed) router.replace("/?reason=forbidden");
  }, [admin, allowed, router]);

  return allowed ? admin : null;
}

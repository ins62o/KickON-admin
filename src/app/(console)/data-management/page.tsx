import { redirect } from "next/navigation";

import { hasAdminPermission } from "@/lib/auth/permissions";
import { requireAdmin } from "@/lib/auth/server";

export default async function DataManagementPage() {
  const admin = await requireAdmin();

  if (hasAdminPermission(admin.role, "sync.read")) redirect("/sync");
  if (hasAdminPermission(admin.role, "system.read")) redirect("/usage");
  if (hasAdminPermission(admin.role, "audit.read")) redirect("/audit");

  redirect("/?reason=forbidden");
}

import type { AdminRole } from "./permissions";

export type AdminIdentity = {
  userId: string;
  email: string | null;
  displayName: string;
  role: AdminRole;
  isDevelopmentBypass: false;
};

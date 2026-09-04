export type AdminApiEnvironment = "development" | "production";

export function resolveAdminApiBaseUrl(environment: AdminApiEnvironment) {
  const buildEnvironment: AdminApiEnvironment = process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT === "production"
    ? "production"
    : "development";
  const scoped = environment === "production"
    ? process.env.NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL
    : process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL;
  const configured = scoped?.trim()
    || (environment === buildEnvironment ? process.env.NEXT_PUBLIC_ADMIN_API_BASE_URL?.trim() : "");
  if (configured) return configured.replace(/\/$/, "");
  if (environment === "development" && process.env.NODE_ENV === "development") return "http://127.0.0.1:3001/api";
  if (environment === "production" && process.env.NODE_ENV !== "development") return "/api";
  return "";
}

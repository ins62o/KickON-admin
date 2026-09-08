import type { NextConfig } from "next";

const serverEnvironment = process.env.KICKON_ENVIRONMENT;
const publicEnvironment = process.env.NEXT_PUBLIC_KICKON_ENVIRONMENT;

if (serverEnvironment && publicEnvironment && serverEnvironment !== publicEnvironment) {
  throw new Error("KICKON_ENVIRONMENT와 NEXT_PUBLIC_KICKON_ENVIRONMENT가 일치해야 합니다.");
}

const kickonEnvironment = (publicEnvironment ?? serverEnvironment) === "production"
  ? "production"
  : "development";
const databaseLimitGb = process.env.NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB
  ?? process.env.SUPABASE_DATABASE_LIMIT_GB;
const storageLimitGb = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB
  ?? process.env.SUPABASE_STORAGE_LIMIT_GB;
const sportsMonksAllowance = process.env.NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE
  ?? process.env.SPORTSMONKS_API_ALLOWANCE;
const developmentSupabaseUrl = process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL
  ?? (kickonEnvironment === "development" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined);
const developmentSupabasePublishableKey = process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY
  ?? (kickonEnvironment === "development" ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined);
const productionSupabaseUrl = process.env.NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL
  ?? (kickonEnvironment === "production" ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined);
const productionSupabasePublishableKey = process.env.NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY
  ?? (kickonEnvironment === "production" ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : undefined);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_KICKON_ENVIRONMENT: kickonEnvironment,
    NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT: process.env.NEXT_PUBLIC_KICKON_DEFAULT_ENVIRONMENT ?? kickonEnvironment,
    NEXT_PUBLIC_SUPABASE_DATABASE_LIMIT_GB: databaseLimitGb,
    NEXT_PUBLIC_SUPABASE_STORAGE_LIMIT_GB: storageLimitGb,
    NEXT_PUBLIC_SPORTSMONKS_API_ALLOWANCE: sportsMonksAllowance,
    NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_URL: developmentSupabaseUrl,
    NEXT_PUBLIC_KICKON_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY: developmentSupabasePublishableKey,
    NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_URL: productionSupabaseUrl,
    NEXT_PUBLIC_KICKON_PRODUCTION_SUPABASE_PUBLISHABLE_KEY: productionSupabasePublishableKey,
    NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL: process.env.NEXT_PUBLIC_KICKON_DEVELOPMENT_ADMIN_API_BASE_URL,
    NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL: process.env.NEXT_PUBLIC_KICKON_PRODUCTION_ADMIN_API_BASE_URL,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
};

export default nextConfig;

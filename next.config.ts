import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: false },
      { source: "/clubs/:path*", destination: "/squads", permanent: false },
      { source: "/players", destination: "/squads", permanent: false },
      { source: "/players/:path*", destination: "/squads/:path*", permanent: false },
      { source: "/fixtures/:path*", destination: "/sync", permanent: false },
      { source: "/rankings/:path*", destination: "/standings", permanent: false },
      { source: "/transfers/:path*", destination: "/squads", permanent: false },
      { source: "/data-status", destination: "/sync", permanent: false },
      { source: "/sync-history/:path*", destination: "/sync", permanent: false },
      { source: "/reports/:path*", destination: "/moderation", permanent: false },
      { source: "/errors/:path*", destination: "/usage?view=errors", permanent: false },
      { source: "/cron", destination: "/sync?view=schedule", permanent: false },
      { source: "/api-usage", destination: "/usage?view=sportsmonks", permanent: false },
      { source: "/supabase", destination: "/usage?view=supabase", permanent: false },
      { source: "/system-status", destination: "/usage", permanent: false },
    ];
  },
};

export default nextConfig;

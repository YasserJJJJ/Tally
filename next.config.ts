import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack's persistent cache served stale compiled CSS after app/globals.css changed:
    // Vercel restored it between deployments and production kept the previous stylesheet.
    // Always compile from source; the build is small enough that the cache saves little.
    turbopackFileSystemCacheForBuild: false,
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;

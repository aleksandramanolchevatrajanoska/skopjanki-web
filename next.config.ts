import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Event posters are uploaded through the admin form (max 2.5 MB).
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;

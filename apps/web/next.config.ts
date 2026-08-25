import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Vercel packages Next.js applications itself. The standalone bundle is
  // retained for local/container deployments, where it is required.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  poweredByHeader: false,
  reactStrictMode: true,
  // Prototype runtime binds to a dynamically allocated loopback port. Next's
  // development server otherwise rejects browser asset and HMR requests whose
  // Origin header uses 127.0.0.1, leaving the page shell blank with 403s.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;

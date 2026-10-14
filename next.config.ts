import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Free tunnels (localhost.run / localtunnel) hit the dev server cross-origin.
  allowedDevOrigins: [
    "*.lhr.life",
    "*.loca.lt",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;

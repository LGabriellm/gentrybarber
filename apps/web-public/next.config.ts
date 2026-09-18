import type { NextConfig } from "next";
import path from 'node:path';
const config: NextConfig = {
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),
  distDir: process.env.NEXT_E2E_MODE === "1" ? ".next-e2e" : ".next",
  transpilePackages: [
    "@platform/themes",
    "@platform/theme-engine",
    "@platform/design-system",
    "@platform/ui",
    "@platform/web-kit",
    "@platform/config",
  ],
  poweredByHeader: false,
  experimental: { cpus: 2 },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;

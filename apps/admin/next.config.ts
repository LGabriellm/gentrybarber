import type { NextConfig } from "next";
const config: NextConfig = {
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
  allowedDevOrigins: ["127.0.0.1"],
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

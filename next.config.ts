import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/shared/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  transpilePackages: ["@gatojs/env"],
  async headers() {
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
  },
};

export default withNextIntl(nextConfig);

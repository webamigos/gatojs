import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./src/shared/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@gatojs/env", "@gatojs/observability"],
  async headers() {
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
  },
};

export default withNextIntl(nextConfig);

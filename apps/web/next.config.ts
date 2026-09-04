import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Docker image runs the standalone server (see Dockerfile).
  output: "standalone",
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ["@maqrivo/core", "@maqrivo/db"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default withNextIntl(nextConfig);

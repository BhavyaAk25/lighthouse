import type { NextConfig } from "next";

// Lighthouse renders live, per-request data (decisions, approvals, audit log),
// so we use the classic request-time model instead of Cache Components.
const nextConfig: NextConfig = {
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

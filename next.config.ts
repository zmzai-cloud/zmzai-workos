import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@zmzai/theme", "@zmzai/db"],
  // NodeNext 后缀映射：theme/db 源码直发（.ts/.tsx 以 .js 说明符互引）
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;

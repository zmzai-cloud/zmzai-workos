import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@zmzai/theme", "@zmzai/db"],
  // 本地 dev 允许 localhost 与 127.0.0.1 互访（否则 _next 静态资源被跨源守卫拒绝，
  // 页面无样式）。生产行为不受影响。
  allowedDevOrigins: ["localhost:3014", "127.0.0.1:3014"],
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

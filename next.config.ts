import type { NextConfig } from "next";

// Static export: `next build` writes plain files into ./out. No server, no database.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

import type { NextConfig } from "next";

// Static export: `next build` writes plain files into ./out. No server, no database.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Keep Next.js rooted in this app when its parent folder also contains a lockfile.
  turbopack: { root: process.cwd() },
};

export default nextConfig;

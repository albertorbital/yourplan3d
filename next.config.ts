import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/yourplan3d',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate `next dev` and `next build` directories so that we can run them separately. Useful for asking AI to verify the build during development.
  distDir: process.env.NODE_ENV === 'production' ? '.next' : '.next-dev',
  eslint: {
    // Allow Playwright builds to proceed without linting errors.
    ignoreDuringBuilds: process.env.PLAYWRIGHT === '1',
  },
};

export default nextConfig;

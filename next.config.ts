import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: 'export',
      assetPrefix: '/AID-30-Practice-260905',
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;

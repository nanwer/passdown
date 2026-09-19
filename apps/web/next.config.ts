import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.GUIDE_NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-auth', 'pg'],
  transpilePackages: [
    '@guide/content',
    '@guide/contracts',
    '@guide/database',
    '@guide/core',
    '@guide/testing',
    '@guide/ui',
    '@guide/guide-ui',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};
export default config;
